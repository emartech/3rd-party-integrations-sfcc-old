(function($){
$(document).ready(function() {

    $('#emarsys-newsletter-subscription button').on('click', function (e) {
        e.preventDefault();
        var email = $('#emarsys-newsletter-subscription #email-alert-address').val();
        if (email.length > 0) {
            $.ajax({
                type: 'POST',
                url: EmarsysUrls.footerSubscription,
                data: {emailAddress: $('#emarsys-newsletter-subscription #email-alert-address').val(), formatajax: true},
                success: function (response) {
                    if (response && response.success) {
                        if (response.accountStatus == "accountexists") {
                            window.location.href = EmarsysUrls.alreadyRegisteredPage;
                        } else if (response.accountStatus == "accountcreated") {
                            window.location.href = EmarsysUrls.thankYouPage;
                        } else if (response.accountStatus == "submitted") {
                            window.location.href = EmarsysUrls.dataSubmittedPage;
                        } else if (response.accountStatus == "error") {
                            window.location.href = EmarsysUrls.errorPage;
                        } else if (response.accountStatus == "disabled") {
                            window.location.href = EmarsysUrls.emarsysDisabledPage;
                        } else if (response.accountStatus == "signup") {
                            window.location.href = EmarsysUrls.emarsysSignup;
                        }
                    } else {
                        window.location.href = EmarsysUrls.errorPage;
                    }
                },
                error: function() {
                    window.location.href = EmarsysUrls.errorPage;
                }
            });
        } else {
            window.location.href = EmarsysUrls.emarsysSignup;
        }
    });

    //Add a checkbox for privacy policy if Emarsys is enabled
    if(window.EmarsysPreferences.enabled &&  window.EmarsysPreferences.enabled != false) {
        var elementBefore = '<input type="checkbox" class="input-checkbox privacy-checkbox" value="false" /> ' + window.EmarsysResources.privacyBeforeLink + ' ',
        elementAfter  = ' ' + window.EmarsysResources.privacyAfterLink;

        $('a.privacy-policy').parent().prepend(elementBefore).append(elementAfter);

        $("#dwfrm_billing").on("submit", function(event) {
            if ($(this).find('input.privacy-checkbox').prop("checked") === false) {
                event.preventDefault();
                $('input.privacy-checkbox').parent().addClass("error-privacy");
            } else {
                $('input.privacy-checkbox').parent().removeClass("error-privacy");;
            }
        });
        $('#account_subscribe').on('click', function(event){
            event.preventDefault();
            $('.email-signup-wrapper').slideDown(800);
        });
    }
});
})(jQuery);
