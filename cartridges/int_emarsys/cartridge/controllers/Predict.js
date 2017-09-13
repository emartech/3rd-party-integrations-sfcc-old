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

exports.GetCartInfo = guard.ensure(['get'], getCartInfo);
exports.GetCustomerInfo = guard.ensure(['get'], getCustomerInfo);
