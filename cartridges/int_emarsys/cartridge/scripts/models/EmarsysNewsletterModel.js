'use strict';

/**
 * Model for EmarsysNewsletter model functionality.
 * @module models/EmarsysModel
 */

/* API Includes */
var Class       = require('~/cartridge/scripts/util/Class').Class;
var Logger      = require('dw/system/Logger');
var obj         = require('dw/object');
var Transaction = require('dw/system/Transaction');
var util        = require("dw/util");

var EmarsysNewsletter = Class.extend({});
var emarsysHelper     = new (require("./../util/EmarsysHelper"))();

EmarsysNewsletter.MapFieldsSignup = function() {
    var map = {};
    var forms = session.forms;

    try {
        if (forms.emarsyssignup) {
            var signupFields = forms.emarsyssignup;
            emarsysHelper.addDataToMap(signupFields, map);
        }
        // return the mapped form
        return map;
    } catch (err) {
        Logger.error("[EnarsysNewsletterModel.js #" + err.lineNumber + "] - ***Emarsys map signup fields data error message: " + err);
        return null;
    }
}

EmarsysNewsletter.getCustomerData = function(args) {
    var customer = session.customer,
        map      = new Object(),
        dataFields;	// object to read data from

    try {
        if (args.Basket) {
            if (args.Basket.billingAddress) {
                dataFields = args.Basket.billingAddress;
            } else if (args.Basket.shipments[0].shippingAddress) {
                dataFields = args.Basket.shipments[0].shippingAddress;
            }
        }

        // if no billing or shipping address available get data from profile if customer authenticated
        if (dataFields) {
            emarsysHelper.addDataToMap(dataFields, map);
        } else {
            if (customer.authenticated) {
                var customerAddressData = customer.addressBook;
                if ("preferredAddress" in customerAddressData && !empty(customerAddressData.preferredAddress)) {
                    dataFields = customerAddressData.preferredAddress;
                } else if (customerAddressData.addresses && customerAddressData.addresses.length > 0) {
                    dataFields = customerAddressData.addresses[0];
                } else {
                    dataFields = customer.profile;
                }
            }

            if (dataFields) {
                emarsysHelper.addDataToMap(dataFields, map);
            }
        }

        /*  If customer decides to subscribe from 'Edit Account' page
             in the middle of checkout process add updated data to the map object
        */
        if (args.SubscriptionType == "account" && customer.authenticated) {
            emarsysHelper.addDataToMap(customer.profile, map);
        }

        if (!empty(map)) {
            args.Map = map;
        }
    } catch (err) {
        Logger.error("[GetCustomerData.ds.ds #" + err.lineNumber + "] - ***Get data error: " + err);
        return args;
    }

    return args;
};

EmarsysNewsletter.getSourceID = function(args) {
    var createSource,
        getAllSources,
        sourceId,
        request    = {},
        sourceName = dw.system.Site.current.preferences.custom.emarsysSourceName;

    try {

        request = {
            "name": sourceName
        };

        getAllSources = emarsysHelper.triggerAPICall("emarsys.api", "source", {}, "GET");

        if (getAllSources.status == "OK") {
            // if source exists the id will be returned
            sourceId = emarsysHelper.getSourceId(getAllSources, sourceName);
        } else {
            Logger.error("Get resources error:" + getAllSources.error + "] - ***Emarsys error message: " + getAllSources.errorMessage);
            return null;
        }

        // if no value was assigned to sourceId made a call to create a resource
        // and a call to get all sources to retrieve source id
        if (!sourceId) {
            // create a source
            createSource = emarsysHelper.triggerAPICall("emarsys.api", "source/create", request, "POST");

            if (createSource.status == "OK") {
                // if source exists the id will be returned
                getAllSources = emarsysHelper.triggerAPICall("emarsys.api", "source", {}, "GET");

                if (getAllSources.status == "OK") {
                    // if source exists the id will be returned
                    sourceId = emarsysHelper.getSourceId(getAllSources, sourceName);
                } else {
                    Logger.error("Get sources error:" + getAllSources.error + "] - ***Emarsys error message: " + getAllSources.errorMessage);
                    return null;
                }
            } else {
                Logger.error("Create source error:" + getAllSources.error + "] - ***Emarsys error message: " + getAllSources.errorMessage);
                return null;
            }
        }

        // args.SourceID = sourceId;
        dw.system.Site.current.setCustomPreferenceValue('emarsysSourceID', sourceId);
    } catch(err) {
        // log error message in case something goes wrong
        Logger.error("[EmarsysNewsletterModel.js #" + err.lineNumber + "] - ***Emarsys get source data error message: " + err);
        return null;
    }

    return args;
}


EmarsysNewsletter.doubleOptInSubscribe = function(args) {
    var updateData,
        triggerEvent,
        updateRequest,
        triggerRequest,
        uid = request.httpParameterMap.uid.stringValue;

    try {
        // get data request
        var getDataRequest = {
            "keyId": "uid",
            "keyValues": [uid]
        };

        var getData = emarsysHelper.triggerAPICall("emarsys.api", "contact/getdata", getDataRequest, "POST");

        // parse getData response to get email
        var email = null;
        if (getData.status == "OK") {
            var dataObj = JSON.parse(getData.object);
            var dataResults = dataObj.data.result;
            if (dataResults) {
                var results = dataResults[0];
                email = results["3"];
            }
        }

        if (email) {
            // request body to update a contact with optIn value set to true
            updateRequest = {
                "keyId": "uid",
                "uid": uid,
                "31": "1",
                "3": email
            };
        } else {
            var errors   = dataObj.data.errors,
                errorMsg = null;	// error message to display on a storefront

            if (errors && errors.length > 0) {
                if (uid) {
                    errorMsg = errors[0].errorMsg;
                } else {
                    errorMsg = dw.web.Resource.msg("subscription.no.uid", "emarsys", null);
                }
            }

            args.ErrorMsg = errorMsg;
            Logger.error(errorMsg);
            return args;
        }

        if (!empty(updateRequest)) {
            // if source id value exists add it to request
            emarsysHelper.addSourceIdToRequest(updateRequest);

            updateData = emarsysHelper.triggerAPICall("emarsys.api", "contact", updateRequest, "PUT");

            if (updateData.status !== "OK") {
                Logger.error("[Update data error:" + updateData.error + "] - ***Emarsys error message: " + updateData.errorMessage);
                args.ErrorMsg = dw.web.Resource.msg("subscription.update.error", "emarsys", null);
                args.errors   = true;
                return args;
            }
        }

        // external event id that will be triggered after updating a contact
        var externalEventId = args.ExternalEventAfterConfirmation;

        if (externalEventId) {
            var endpoint = "event/" + externalEventId + "/trigger";

            triggerRequest = {
                "key_id": "uid",
                "external_id": uid
            };

            triggerEvent = emarsysHelper.triggerAPICall("emarsys.api", endpoint, triggerRequest, "POST");

            if (triggerEvent.status !== "OK") {
                Logger.error("[Triggere event error:" + triggerEvent.error + "] - ***Emarsys error message: " + triggerEvent.errorMessage);
                return null;
            }
        }
    } catch(err) {
        // log error message in case something goes wrong
        Logger.error("[DoubleOptInSubscribe.ds #" + err.lineNumber + "] - ***Emarsys subscribe contact data error message: " + err);
        return null;
    }

    return args;
}


// to read subscription type data from CO
EmarsysNewsletter.subscriptionTypeData = function(SubscriptionType) {
    var args = {};

    try {
        Transaction.begin();
        var type = SubscriptionType,
            co   = dw.object.CustomObjectMgr.getCustomObject("EmarsysNewsletterSubscription", type);

        if (co.custom.optInStrategy) {
            args.Strategy                       = co.custom.optInStrategy;
            args.ExternalEvent                  = co.custom.optInExternalEvent;
            args.ExternalEventAfterConfirmation = co.custom.optInExternalEventAfterConfirmation;
        } else {
            args.Strategy                       = null;
            args.ExternalEvent                  = null;
            args.ExternalEventAfterConfirmation = null;
        }
        // commit the CO modifications and return the processed args
        Transaction.commit()
        return args;
    } catch(err) {
        // rollback the database interaction
        Transaction.rollback();
        // log error message in case something goes wrong
        Logger.error("[EnarsysNewsletterModel.js #" + err.lineNumber + "] - ***Emarsys subscrition type data error message: " + err);
        return null;
    }
}

// Sends contact data and define if external event should be triggered or not
EmarsysNewsletter.SendDataForDoubleOptIn = function(args) {
    var contactData,
        sendData,
        requestObj = {},
        fields = [],
        map = args.Map;

    try {

        // request body to check if contact already exists
        requestObj = {
            "keyId": "3",
            "keyValues": [args.Email]
        }

        // send request to check if contact already exists
        contactData = emarsysHelper.triggerAPICall("emarsys.api", "contact/getdata", requestObj, "POST");

        // parse response
        var dataObj = JSON.parse(contactData.object),
            errors  = dataObj.data.errors;

        var method  = "PUT";
        var results = null;
        // check for errors
        if (errors.length > 0) {
            var error = errors[0];
            // account does not exist
            if (error.errorCode == "2008") {
                method = "POST";
            } else {
                Logger.error("Get data error:" + contactData.error + "] - ***Emarsys error message: " + contactData.errorMessage);
                return null;
            }
        } else {
            var dataResults = dataObj.data.result,
                results     = dataResults[0];
        }

        // the value depends on field 31 value in response
        var optIn = results ? results['31'] : null;

        // event will be triggered if optIn status set to false or doesn't set at all
        args.TriggerEvent = optIn != 1;
        if (optIn == null) {
            if (!map) map = {};
            if (args.SubscribeToEmails) {
                map["31"] = 2;
            }
        }

        if (map) {
            // this is a new request body that will be sent in case if account doen't exists or it's status for optin is false (null)
            var requestNew = {
                "keyId": "3",
                "3": args.Email,
            };

            // if source id value exists add it to request
            emarsysHelper.addSourceIdToRequest(requestNew);

            // if subscription is called from checkout or signup page addFields function will add fields to request
            emarsysHelper.addFields(map, requestNew);

            sendData = emarsysHelper.triggerAPICall("emarsys.api", "contact", requestNew, method);

            if (sendData.status !== "OK") {
                Logger.error("Update data error:" + sendData.error + "] - ***Emarsys error message: " + sendData.errorMessage);
                return null;
            }
        }
    } catch (err) {
        // log error message in case something goes wrong
        Logger.error("[EnarsysNewsletterModel.js #" + err.lineNumber + "] - ***Emarsys send contact data error message: " + err);
        return null;
    }

    return args;
}

EmarsysNewsletter.TriggerExternalEvent = function(args) {
    var triggerEvent,
        requestObj = {};

    try {
        var externalEventId = args.ExternalEvent;

        if (externalEventId) {
            var endpoint = "event/" + externalEventId + "/trigger";

            requestObj = {
                "key_id": "3",
                "external_id": args.Email
            };

            triggerEvent = emarsysHelper.triggerAPICall("emarsys.api", endpoint, requestObj, "POST");

            if (triggerEvent.status !== "OK") {
                Logger.error("[Trigger event error:" + triggerEvent.error + "] - ***Emarsys error message: " + triggerEvent.errorMessage);
                response.redirect("EmarsysNewsletter-RedirectToErrorPage");
                return;
            }
        }

    } catch(err) {
        // log error message in case something goes wrong
        Logger.error("[EnarsysNewsletterModel.js #" + err.lineNumber + "] - ***Emarsys trigger event data error message: " + err);
        // return null and the redirect for error will be handled externally
        args.Error = true;
        return args;
    }

    return args;
}

EmarsysNewsletter.GetAccountStatus = function(args) {
    var contactData,
        requestObj = {};

    try {
        requestObj = {
            "keyId": "3",
            "keyValues": [args.Email],
            "fields" : ["31"]
        }

        // call to get contact data on Emarsys
        contactData = emarsysHelper.triggerAPICall("emarsys.api", "contact/getdata", requestObj, "POST");

        if (contactData.status !== "OK") {
            Logger.error("Get data error:" + contactData.error + "] - ***Emarsys error message: " + contactData.errorMessage);
            if(args.SubscriptionType == "checkout" || !(args.SubscriptionType == "account" && args.EmarsysSignupPage)){
                return args;
            } else {
                app.getView().render('subscription/emarsys_error');
                return;
            }
        }

        var dataObj = JSON.parse(contactData.object);
        var errors = dataObj.data.errors;

        if (errors.length > 0) {
            var error = errors[0];
            // check if account exists, error code 2008 means that account wasn't created yet
            if (error.errorCode == "2008") {
                args.Status = "NOT REGISTERED";
            }
        } else {
            var dataResults = dataObj.data.result,
                results     = dataResults[0];

            // depending on optIn value (2 = false) set corresponding status
            if (results["31"] == 2) {
                args.Status = "NOT FILLED";
            } else {
                args.Status = "FILLED";
            }
        }
        return args;
    } catch(err) {
        // log error message in case something goes wrong
        Logger.error("[EnarsysNewsletterModel.js #" + err.lineNumber + "] - ***Emarsys get contact data error message: " + err);
        if(args.SubscriptionType == "checkout" || !(args.SubscriptionType == "account" && args.EmarsysSignupPage)){
            return args;
        } else {
            app.getView().render('subscription/emarsys_error');
        }
    }
}

EmarsysNewsletter.UpdateAccountFormWithCustomerData = function(signupForm) {
    var SubscribeObj = {
        gender       : '',
        address1     : '',
        city         : '',
        countryCode  : '',
        stateCode    : '',
        postalCode   : '',
        firstName    : '',
        lastName     : '',
        phone        : '',
        emailAddress : ''
    };

    if (customer.profile.email != null) {
        SubscribeObj.emailAddress = customer.profile.email;
    }

    if (customer.profile.addressBook.preferredAddress != null) {
        SubscribeObj.address1    = customer.profile.addressBook.preferredAddress.address1 || '';
        SubscribeObj.city        = customer.profile.addressBook.preferredAddress.city || '';
        SubscribeObj.stateCode   = customer.profile.addressBook.preferredAddress.stateCode || '';
        SubscribeObj.countryCode = customer.profile.addressBook.preferredAddress.countryCode.value || '';
        SubscribeObj.postalCode  = customer.profile.addressBook.preferredAddress.postalCode || '';
        SubscribeObj.firstName   = customer.profile.addressBook.preferredAddress.firstName || '';
        SubscribeObj.lastName    = customer.profile.addressBook.preferredAddress.lastName || '';
        SubscribeObj.phone       = customer.profile.addressBook.preferredAddress.phone || '';
    }

    if (customer.profile.gender != null && customer.profile.gender.value > 0) {
        SubscribeObj.gender = customer.profile.gender == 1 ? 'male' : (customer.profile.gender == 2) ? 'female' : '';
    }
    // update the form
    signupForm.copyFrom(SubscribeObj);
    // export the updated args
    return signupForm;
}

EmarsysNewsletter.SubmitContactData = function(args) {
    var submitData,
        requestObj = {},
        map        = args.Map,
        method     = args.Method;

    try {
        requestObj = {
            "keyId": "3",
            "3": args.Email,
        };

        // if source id value exists add it to request
        emarsysHelper.addSourceIdToRequest(requestObj);

        // check subscription type before assign value to field 31
        if (args.SubscriptionType == "checkout") {
            // if customer checked corresponding checkbox on billing page filed 31 with value 1 (true) added to request
            if (args.SubscribeToEmails) {
                requestObj["31"] = 1;
            }
        } else if (args.SubscriptionType == "footer") {
            requestObj["31"] = 1;
        } else if (args.SubscriptionType == "account") {
            if (args.SubscribeToEmails) {
                requestObj["31"] = 1;
            }
        }

        // if subscription is acalled from checkout or signup page addFields function will add fields to request
        emarsysHelper.addFields(map, requestObj);

        // call to create contact data on Emarsys
        submitData = emarsysHelper.triggerAPICall("emarsys.api", "contact", requestObj, method);

        if (submitData.status !== "OK") {
            Logger.error("Submit data error:" + submitData.error + "] - ***Emarsys error message: " + submitData.errorMessage);
            if (args.SubscriptionType == "checkout" || args.Action == "create") {
                return args;
            } else {
                app.getView().render('subscription/emarsys_error');
                return;
            }
        }
        return args;
    } catch(err) {
        // log error message in case something goes wrong
        Logger.error("Error:" + err.lineNumber + "] - ***Emarsys submit contact data error message: " + err);
        if (args.SubscriptionType == "checkout" || args.Action == "create") {
            return args;
        } else {
            app.getView().render('subscription/emarsys_error');
            return;
        }
    }
}

EmarsysNewsletter.newsletterUnsubscribe = function(args) {
    var uid          = !empty(args.passedParams) ? args.passedParams.uid : args.uid, //user id
        cid          = !empty(args.passedParams) ? args.passedParams.cid : args.cid, //campaign id
        lid          = !empty(args.passedParams) ? args.passedParams.lid : args.lid, //launch list id
        direct       = !empty(args.passedParams) ? args.passedParams.direct : args.direct, //y or n
        confirmation = !empty(args.passedParams) ? args.passedParams.confirmation : args.confirmation;

    try {
        if(direct == "y" || (!empty(confirmation) && confirmation.triggeredAction.formId == "newsletter_unsubscribe")) {
            args.showConfirmation = false;

            //31 : 2 means optin : false
            var unsubscribeContact             = emarsysHelper.triggerAPICall("emarsys.api", "contact", { "31" : "2", key_id : "uid", uid : uid }, "PUT");
            var unsubscribeContactFromCampaign = emarsysHelper.triggerAPICall("emarsys.api", "email/unsubscribe", { launch_list_id : lid, email_id : cid, contact_uid : uid }, "POST");

            if(unsubscribeContact.status == "OK" && unsubscribeContactFromCampaign.status == "OK") {
                args.errors = false; // successfully unsubscribed

            } else {
                var errorMessage = unsubscribeContact.errorMessage ? unsubscribeContact.errorMessage : unsubscribeContactFromCampaign.errorMessage;
                var errorMsg     = JSON.parse(errorMessage);
                args.errorText   = errorMsg.replyText;
                args.errors      = true; // an error occurred; unsuccessful unsubscription
            }
        } else {
            args.showConfirmation = true;
            args.params           = { uid : uid, cid : cid, lid : lid, direct : "y" };
        }

    } catch (err) {
      dw.system.Logger.error("EmarsysNewsletter.js #" + err.lineNumber + "] - ***Emarsys newsletter unsubscription error message: " + err);
      args.errors = true;
      return args;
    }

    return args;
}

EmarsysNewsletter.accountUnsubscribe = function(email) {
    var contactData,
        request = {};

    if (empty(email)){
        return {
            status: 'NO EMAIL'
        };
    }

    try {
        request = {
            "keyId": "3",
            "keyValues": [email],
            "fields" : ["31"]
        }

        // call to get contact data on Emarsys
        contactData = emarsysHelper.triggerAPICall("emarsys.api", "contact/getdata", request, "POST");

        if (contactData.status !== "OK") {
            return {
                status: 'API ERROR',
                contactData: contactData
            };
        }

        var dataObj = JSON.parse(contactData.object);

        var errors = dataObj.data.errors;

        if (errors.length > 0) {
            var error = errors[0];
            // check if account exists, error code 2008 means that account wasn't created yet
            if (error.errorCode == "2008") {
                return {
                    status: 'NOT REGISTERED'
                };
            }
        } else {
            request = {
                "3": email,
                "31": "2",
                "key_id": "3"
            }

            // if source id value exists add it to request
            emarsysHelper.addSourceIdToRequest(request);

            contactData = emarsysHelper.triggerAPICall("emarsys.api", "contact", request, "PUT");
            if (contactData.status !== "OK") {
                return {
                    status: 'EMARSYSHELPER ERROR',
                    contactData: contactData
                };
            }

            return {
                status: 'SUCCESS'
            };
        }
    }
    catch(err) {
        Logger.error("[EmarsysNewsletter.js - accountUnsubscribe()] - ***Emarsys unsubscribe error message: " + err.toString());
        return {
            status: 'GENERAL ERROR'
        };
    }
}

/** The AbstractModel class */
module.exports = EmarsysNewsletter;
