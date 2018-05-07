'use strict';

/**
 * @module controllers/Predict
 */

/* Script Modules */
var app   = require('~/cartridge/scripts/app');
var guard = require('~/cartridge/scripts/guard');

function getCartInfo() {
    app.getView({
        Basket: dw.order.BasketMgr.getCurrentBasket()
    }).render('components/predict/cartinfo');
}

function getCustomerInfo() {
    app.getView({
        PageContext: request.httpParameterMap.PageContext,
        GuestEmail: request.httpParameterMap.GuestEmail
    }).render('components/predict/customerinfo');
}

function returnCartObject() {
    var useGrossPrice = dw.system.Site.current.getCustomPreferenceValue('emarsysUseGrossPrice'),
        cart          = dw.order.BasketMgr.getCurrentBasket(),
        cartObj       = [];

    if (cart != null) {
        for each(var ProductLineItem in cart.getProductLineItems()) {
            if (ProductLineItem.bonusProductLineItem || ProductLineItem.bundledProductLineItem) {continue;}

            var prodObject = {
                'item' : ProductLineItem.productID,
                'price' : useGrossPrice == true ? parseFloat((ProductLineItem.adjustedGrossPrice.value).toFixed(2)) : parseFloat((ProductLineItem.adjustedNetPrice.value).toFixed(2)),
                'quantity' : ProductLineItem.quantityValue
            }

            cartObj.push(prodObject);
        }
    }

    response.setContentType('application/json');

    response.writer.print(JSON.stringify(cartObj));
}

exports.GetCartInfo = guard.ensure(['get'], getCartInfo);
exports.GetCustomerInfo = guard.ensure(['get'], getCustomerInfo);
exports.ReturnCartObject = guard.ensure(['get'], returnCartObject);
