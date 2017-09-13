'use strict';

/**
 *	Controller used for managing the newsletter subscription process
 *
 * @module controllers/EmarsysNewsletter
 */

/* API includes */
var Resource          = require('dw/web/Resource');
var URLUtils          = require('dw/web/URLUtils');
var Form              = require('~/cartridge/scripts/models/FormModel');
var OrderMgr          = require('dw/order/OrderMgr');
var Transaction       = require('dw/system/Transaction');
var Logger            = require('dw/system/Logger');
/* Script Modules */
var app               = require('~/cartridge/scripts/app');
var guard             = require('~/cartridge/scripts/guard');
var EmarsysNewsletter = app.getModel('EmarsysNewsletter');

/**
 * Renders the Newsletter form page.
 */
function signup() {
    try {
        if (!dw.system.Site.getCurrent().getCustomPreferenceValue("emarsysEnabled")) {
            emarsysDisabledTemplate();
            return;
        }
        // clear form
        app.getForm('emarsyssignup').clear();
        // render the Submit Form
        app.getView({
            ContinueURL: URLUtils.https('EmarsysNewsletter-SubmitForm')
        }).render('subscription/emarsyssignup');
    } catch(e) {
        errorPage(e);
    }
}

function unsubscribe() {
    var args = {};
    var req = request.httpParameterMap;

    try {
        if (!empty(args.UnsubscribeParams) || (!empty(request.httpParameterMap.uid.stringValue) && !empty(request.httpParameterMap.cid.stringValue) && !empty(request.httpParameterMap.lid.stringValue) && !empty(request.httpParameterMap.direct.stringValue))) {
            // construct arguments
            args.cid          = req.cid.stringValue;
            args.confirmation = req.triggeredForm;
            args.direct       = req.direct.stringValue;
            args.lid          = req.lid.stringValue;
            args.uid          = req.uid.stringValue;
            // call unsubscribe function
            args              = EmarsysNewsletter.newsletterUnsubscribe(args);


            app.getView({
                ContinueURL: URLUtils.https('EmarsysNewsletter-Unsubscribe'),
                ShowConfirmation: args.showConfirmation,
                Errors: args.errors,
                params: args.params
            }).render('unsubscribe/landing_unsubscribe');
        } else {
            app.getView({
                ContinueURL: URLUtils.https('EmarsysNewsletter-Unsubscribe')
            }).render('unsubscribe/landing_unsubscribe');
        }
    } catch(e) {
        // log error and redirect to error page
        errorPage(e);
    }
}

function emailSettings(args) {
    var signupForm = app.getForm('emarsyssignup');
    try {
        signupForm.clear();
        // update form with account data
        EmarsysNewsletter.UpdateAccountFormWithCustomerData(signupForm);
        app.getView({
            ContinueURL: URLUtils.https('EmarsysNewsletter-EmailSettingsHandleForm')
        }).render('subscription/emarsys_emailsettings');
    } catch(e) {
        errorPage(e);
    }


}

function emailSettingsHandleForm() {
    var args = {
        Email             : session.forms.emarsyssignup.emailAddress.value,
        EmarsysSignupPage : true,
        SubscriptionType  : "account",
        SubscribeToEmails : true
    }
    // map the form fields
    args.Map = EmarsysNewsletter.MapFieldsSignup();
 // send form to processing
    processor(args);
}

/**
 *  Handle for form submission.
 */
function submitForm() {
    var args               = {};
    args.Email             = session.forms.emarsyssignup.emailAddress.value;
    args.EmarsysSignupPage = true;
    args.SubscriptionType  = "footer";
    args.SubscribeToEmails = true;
    args.Map               = EmarsysNewsletter.MapFieldsSignup(); // map the form fields
    // send form to processing
    processor(args);
}




function accountSubscription() {
    var args = {};
    if(dw.system.Site.getCurrent().getCustomPreferenceValue("emarsysEnabled")) {
        args.SubscriptionType  = "account";
        args.Email             = session.customer.profile.email;
        args.SubscribeToEmails = request.httpParameterMap.dwfrm_profile_customer_addtoemaillist.booleanValue;
        args                   = getCustomerData(args); // get customer data
        // process the request and form data
        processor(args);
    } else {
        emarsysDisabledTemplate();
    }
}

function checkoutSubscription() {
    var args = {};
    if(dw.system.Site.getCurrent().getCustomPreferenceValue("emarsysEnabled")) {
        args.SubscriptionType  = "checkout";
        args.Email             = session.forms.billing.billingAddress.email.emailAddress.value;
        args.SubscribeToEmails = session.forms.billing.billingAddress.addToEmailList.checked;
        args                   = getCustomerData(args); // get customer data
        // process the request and form data
        processor(args);
    } else {
        emarsysDisabledTemplate();
    }
}

function footerSubscription() {
    var args = {};
    var emarsysEnabled = dw.system.Site.getCurrent().getCustomPreferenceValue("emarsysEnabled");
    if(!empty(emarsysEnabled) && emarsysEnabled) {
        args.SubscriptionType  = "footer";
        args.Email             = request.httpParameterMap.emailAddress.value;
        args.SubscribeToEmails = true;
        args                   = getCustomerData(args); // get customer data
        // redirect to subscribe page if email address is empty
        if (request.httpParameterMap.emailAddress.empty) {
            if (request.httpParameterMap.formatajax.stringValue === "true") {
                var accountStatus = "signup";
                // respond with ajax
                response.setContentType("application/json");
                // construct and convert the json response
                var json = JSON.stringify({
                    "success"       : true,
                    "accountStatus" : accountStatus
                });
                // send json to client
                response.writer.print(json);
            } else {
                signup();
            }
        } else {
            // process the request and form data
            processor(args);
        }
    } else {
        emarsysDisabledTemplate();
    }
}

function processor(args) {
    try {
        // get subscription data type info
        var TypeData = EmarsysNewsletter.subscriptionTypeData(args.SubscriptionType);

        // redirect in case of error
        if (empty(TypeData) || empty(TypeData.Strategy)) {
            redirectToErrorPage(args);
            return;
        }

        if (TypeData.Strategy == "1") {
            // get the account status
            args = EmarsysNewsletter.GetAccountStatus(args);
            // check current request is on subscription page and not other pages
            if (args.SubscriptionType == "checkout" || args.EmarsysSignupPage && (args.SubscriptionType != "account" && args.SubscriptionType != "footer")) {
                return args;
            }

            if (args.Status === "NOT REGISTERED") {
                args.Method = "POST";
                args        = submitData(args);
                // redirect customer
                if (request.httpParameterMap.formatajax.stringValue === "true") {
                    var accountStatus = "accountcreated";
                    // respond with ajax
                    response.setContentType("application/json");
                    // construct and convert the json response
                    var json = JSON.stringify({
                        "success"       : true,
                        "accountStatus" : accountStatus
                    });
                    response.writer.print(json);
                } else {
                    redirectToThankYouPage(args);
                }
            } else if (args.Status === "FILLED") {
                args.Method = "PUT";
                args        = submitData(args);
                // redirect customer
                if (request.httpParameterMap.formatajax.stringValue === "true") {
                    var accountStatus = "accountexists";
                    // respond with ajax
                    response.setContentType("application/json");
                    // construct and convert the json response
                    var json = JSON.stringify({
                        "success"       : true,
                        "accountStatus" : accountStatus
                    });
                    response.writer.print(json);
                } else {
                    redirectToAlreadyRegisteredPage(args);
                }
            } else {
                args.Method = "PUT";
                args        = submitData(args);
                // redirect customer
                if (request.httpParameterMap.formatajax.stringValue === "true") {
                    var accountStatus = "accountcreated";
                    // respond with ajax
                    response.setContentType("application/json");
                    // construct and convert the json response
                    var json = JSON.stringify({
                        "success"       : true,
                        "accountStatus" : accountStatus
                    });
                    response.writer.print(json);
                } else {
                    redirectToThankYouPage(args);
                }
            }
        } else {
            var args = EmarsysNewsletter.SendDataForDoubleOptIn(args);
            // check event trigger
            if(checkNotEmpty(args) && args.TriggerEvent) {
                args = EmarsysNewsletter.TriggerExternalEvent(args);
                if (!empty(args.Error) && args.Error) {
                    redirectToErrorPage(args);
                    return;
                } else if (!empty(args.Error)) {
                    app.getView().render('subscription/emarsys_error');
                    return;
                }
                // check if args are constructed
                if(checkNotEmpty(args)) {
                    if (request.httpParameterMap.formatajax.stringValue === "true") {
                        var accountStatus = "submitted";
                        // respond with ajax
                        response.setContentType("application/json");
                        // construct and convert the json response
                        var json = JSON.stringify({
                            "success"       : true,
                            "accountStatus" : accountStatus
                        });
                        response.writer.print(json);
                    } else {
                        redirectToDataSubmittedPage(args);
                    }
                    return;
                }
            } else {
                if (request.httpParameterMap.formatajax.stringValue === "true") {
                    var accountStatus = "accountexists";
                    // respond with ajax
                    response.setContentType("application/json");
                    // construct and convert the json response
                    var json = JSON.stringify({
                        "success"       : true,
                        "accountStatus" : accountStatus
                    });
                    response.writer.print(json);
                } else {
                    redirectToAlreadyRegisteredPage(args);
                }
                return;
            }
        }
        return;
    } catch(e) {
        // catch and log the error
        errorPage(e);
    }
}

/**
 * Renders the error page.
 */
function errorPage(e) {
    if (!empty(e)) {
        Logger.error("[Error page redirect:" + e.error + "] - ***Emarsys error message: " + e.errorMessage);
    }
    app.getView().render('subscription/emarsys_error');
}

/**
 * Renders the account overview.
 */
function thankYouPage() {
    app.getView().render('subscription/emarsys_thankyou');
}

/**
 * Renders the account overview.
 */
function alreadyRegisteredPage() {
    app.getView().render('subscription/emarsys_alreadyregistered');
}

/*
 * Renders the account overview.
 */
function dataSubmittedPage() {
    app.getView().render('subscription/emarsys_datasubmitted');
}

function emarsysDisabledTemplate() {
    app.getView().render('subscription/emarsys_disabled');
}

function redirectToDataSubmittedPage(args) {
    try {
        var redirectValue = redirect(args);
        if (redirectValue === "ajax") {
            var accountStatus = "submitted";
            // respond with ajax
            response.setContentType("application/json");
            // construct and convert the json response
            var json = JSON.stringify({
                "success"       : true,
                "accountStatus" : accountStatus
            });
            // send json to client
            response.writer.print(json);
        } else if (redirectValue === "noAjax") {
            dataSubmittedPage();
        } else {
            return;
        }
    } catch(e) {
        errorPage(e);
    }
}

function redirectToThankYouPage(args) {
    switch(redirect(args)) {
        case "ajax":
            var accountStatus = "accountcreated";
            // respond with ajax
            response.setContentType("application/json");
            // construct and convert the json response
            var json = JSON.stringify({
                "success"       : true,
                "accountStatus" : accountStatus
            });
            // send json to client
            response.writer.print(json);
            break;
        case "noAjax":
            thankYouPage();
            break;
        case "noRedirect":
            return;
    }
}

function redirectToAlreadyRegisteredPage(args) {
    switch(redirect(args)) {
        case "ajax":
            var accountStatus = "accountexists";
            // respond with ajax
            response.setContentType("application/json");
            // construct and convert the json response
            var json = JSON.stringify({
                "success"       : true,
                "accountStatus" : accountStatus
            });
            // send json to client
            response.writer.print(json);
            break;
        case "noAjax":
            alreadyRegisteredPage();
            break;
        case "noRedirect":
            return;
    }
}

function redirectToDisabledPage() {
    switch(redirect(args)) {
        case "ajax":
            var accountStatus = "disabled";
            // respond with ajax
            response.setContentType("application/json");
            // construct and convert the json response
            var json = JSON.stringify({
                "success"       : true,
                "accountStatus" : accountStatus
            });
            // send json to client
            response.writer.print(json);
            break;
        case "noAjax":
            emarsysDisabledTemplate();
            break;
        case "noRedirect":
            return;
    }

}

function redirectToErrorPage(args) {
    switch(redirect(args)) {
        case "ajax":
            var accountStatus = "error";
            // respond with ajax
            response.setContentType("application/json");
            // construct and convert the json response
            var json = JSON.stringify({
                "success"       : true,
                "accountStatus" : accountStatus
            });
            // send json to client
            response.writer.print(json);
            break;
        case "noAjax":
            errorPage();
            break;
        case "noRedirect":
            return;
    }
}

function checkoutDoubleOptInThankYou() {
    var args = {};
    if (dw.system.Site.getCurrent().getCustomPreferenceValue("emarsysEnabled")) {
        args = EmarsysNewsletter.subscriptionTypeData("checkout");
        args = EmarsysNewsletter.doubleOptInSubscribe(args);
        if(checkNotEmpty(args)) {
            app.getView().render('subscription/double_optin_thank_you_page');
        }
    } else {
        emarsysDisabledTemplate();
    }
}

function accountoutDoubleOptInThankYou() {
    var args = {};
    if (dw.system.Site.getCurrent().getCustomPreferenceValue("emarsysEnabled")) {
        args = EmarsysNewsletter.subscriptionTypeData("account");
        args = EmarsysNewsletter.doubleOptInSubscribe(args);
        if(checkNotEmpty(args)) {
            app.getView().render('subscription/double_optin_thank_you_page');
        }
    } else {
        emarsysDisabledTemplate();
    }
}

function footerDoubleOptInThankYou() {
    var args = {};
    if (dw.system.Site.getCurrent().getCustomPreferenceValue("emarsysEnabled")) {
        args = EmarsysNewsletter.subscriptionTypeData("footer");
        args = EmarsysNewsletter.doubleOptInSubscribe(args);
        if(checkNotEmpty(args)) {
            app.getView().render('subscription/double_optin_thank_you_page');
        }
    } else {
        emarsysDisabledTemplate();
    }
}

function getCustomerData(args) {
    args.basket = dw.order.BasketMgr.getCurrentBasket();
    args        = EmarsysNewsletter.getCustomerData(args);
    return args;

}

function submitData(args) {
    args = EmarsysNewsletter.SubmitContactData(args);

    if(!empty(args.ExternalEvent) && args.ExternalEvent) {
        triggerArgs = EmarsysNewsletter.TriggerExternalEvent(args);
        if (!empty(args.Error) && args.Error) {
            if (args.SubscriptionType == "checkout" || args.Action == "create") {
                return args;
            } else if (empty(args.Error)) {
                app.getView().render('subscription/emarsys_error');
                return;
            }
        } else {
            app.getView().render('subscription/emarsys_error');
            return;
        }
        return args;
    }

    return args;
}

function redirect(args) {
    var answer = null;
    // process subscription for redirect route
    if(!empty(args.SubscriptionType) && args.SubscriptionType !== "checkout") {
        if(empty(args.EmarsysSignupPage) || (!empty(args.EmarsysSignupPage) && !args.EmarsysSignupPage)) {
            if (!empty(args.SubscriptionType) && args.SubscriptionType === "footer") {
                answer = "noAjax";
            } else if(!empty(args.SubscriptionType) && args.SubscriptionType !== "account") {
                answer = "ajax";
            } else {
                answer = "noRedirect";
            }
        } else {
            answer = "noAjax";
        }
    } else {
        answer = "noRedirect";
    }
    return answer;
}

function checkNotEmpty(args) {
    if(empty(args)) {
        redirectToErrorPage(args);
    } else {
        return true;
    }
}

/**
 * Account unsubscribe handle
 */
function accountUnsubscribe() {
    var ret = EmarsysNewsletter.accountUnsubscribe(customer.profile.email);

    switch (ret.status) {
        case ('NO EMAIL'):
        case ('NOT REGISTERED'):
        case ('SUCCESS'):
            app.getView({
                Status: ret.status
            }).render('unsubscribe/account_unsubscribe');
            break;
        case ('EMARSYSHELPER ERROR'):
            errorPage(ret.contactData);
            break;
        case ('GENERAL ERROR'):
            errorPage();
            break;
    }
}

/**
 * Called from pipeline. Creates account subscription.
 */
function accountSubscriptionPipe() {
    accountSubscription();
}

/**
 * Called from pipeline. Creates account subscription on checkout steps.
 */
function checkoutSubscriptionPipe() {
    checkoutSubscription();
}

/* Web exposed methods */

/* Renders the Newsletter form page. */
exports.Signup = guard.ensure(['get', 'https'], signup);
/* Handle for form submission. */
exports.SubmitForm = guard.ensure(['post', 'https'], submitForm);
/* Renders the error page. */
exports.ErrorPage = guard.ensure(['get', 'https'], errorPage);
/* Renders the account overview. */
exports.ThankYouPage = guard.ensure(['get', 'https'], thankYouPage);
/* Renders the account overview. */
exports.AlreadyRegisteredPage = guard.ensure(['get', 'https'], alreadyRegisteredPage);
/* Renders the account overview. */
exports.DataSubmittedPage = guard.ensure(['get', 'https'], dataSubmittedPage);
/* Render when Emarsys integration is disabled. */
exports.EmarsysDisabledTemplate = guard.ensure(['get', 'https'], emarsysDisabledTemplate);
/* Handles account page subscription calls. */
exports.AccountSubscription   = guard.ensure(['get', 'https'], accountSubscription);
/* Handle for checkout subscription calls. */
exports.CheckoutSubscription = guard.ensure(['post', 'https'], checkoutSubscription);
/* Pipeline handles global footer subscription calls through ajax. */
exports.FooterSubscription = guard.ensure(['post'], footerSubscription);
/* Redirect to submitted page */
exports.RedirectToDataSubmittedPage = guard.ensure(['get', 'https'], redirectToDataSubmittedPage);
/* Redirect a customer to 'thank you' page in case of footer subscription. */
exports.RedirectToThankYouPage = guard.ensure(['get', 'https'], redirectToThankYouPage);
/* Redirect a customer to 'already registered' page in case of footer */
exports.RedirectToAlreadyRegisteredPage = guard.ensure(['get', 'https'], redirectToAlreadyRegisteredPage);
/* Redirects customer to error page (if any error) */
exports.RedirectToErrorPage = guard.ensure(['get'], redirectToErrorPage);
/* Redirects customer to Emarsys disabled page if Emarsys is disabled in Site Preferences */
exports.RedirectToDisabledPage = guard.ensure(['get', 'https'], redirectToDisabledPage);
/* Manages the unsubscribe process */
exports.Unsubscribe = guard.ensure(['get', 'https'], unsubscribe);
/* Renders email settings page with form, maps its data on existing emarsys codes and jumps to ProcessData subpipeline to process recieved data. */
exports.EmailSettings = guard.ensure(['get', 'https', 'loggedIn'], emailSettings);
/* Email settings form handle */
exports.EmailSettingsHandleForm = guard.ensure(['post', 'https', 'loggedIn'], emailSettingsHandleForm);
/* Account unsubscribe handle */
exports.AccountUnsubscribe = guard.ensure(['https', 'loggedIn'], accountUnsubscribe);
/* Account Double OptIn Thank You page */
exports.AccountoutDoubleOptInThankYou = guard.ensure(['get', 'https'], accountoutDoubleOptInThankYou);
/* Footer Double OptIn Thank You page */
exports.FooterDoubleOptInThankYou = guard.ensure(['get', 'https'], footerDoubleOptInThankYou);
/* Checkout Double OptIn Thank You page */
exports.CheckoutDoubleOptInThankYou = guard.ensure(['get', 'https'], checkoutDoubleOptInThankYou);

/* Pipeline directive calls */
exports.AccountSubscriptionPipe = accountSubscriptionPipe;
exports.CheckoutSubscriptionPipe = checkoutSubscriptionPipe;
