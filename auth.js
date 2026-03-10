(function() {
    var PASSWORD = 'rankings123';
    var SESSION_KEY = 'rk_authenticated';

    if (sessionStorage.getItem(SESSION_KEY) === 'true') return;

    document.documentElement.style.visibility = 'hidden';

    document.addEventListener('DOMContentLoaded', function() {
        document.body.style.visibility = 'visible';
        document.documentElement.style.visibility = 'visible';

        var overlay = document.createElement('div');
        overlay.id = 'auth-overlay';
        overlay.innerHTML = '\
            <div id="auth-box">\
                <div id="auth-logo">RK</div>\
                <h2>Revenue Kitchen</h2>\
                <p>Enter password to continue</p>\
                <form id="auth-form">\
                    <input type="password" id="auth-password" placeholder="Password" autofocus>\
                    <button type="submit">Enter</button>\
                    <div id="auth-error"></div>\
                </form>\
            </div>';

        var style = document.createElement('style');
        style.textContent = '\
            #auth-overlay {\
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;\
                background: #07374F; z-index: 99999;\
                display: flex; align-items: center; justify-content: center;\
                font-family: "IBM Plex Sans", sans-serif;\
            }\
            #auth-overlay * { visibility: visible; }\
            #auth-box {\
                background: #fefaed; border-radius: 12px; padding: 48px 40px;\
                text-align: center; width: 360px; max-width: 90vw;\
                box-shadow: 0 8px 32px rgba(0,0,0,0.3);\
            }\
            #auth-logo {\
                width: 56px; height: 56px; background: #07374F; color: #eaff6a;\
                border-radius: 10px; display: flex; align-items: center; justify-content: center;\
                font-family: "IBM Plex Mono", monospace; font-weight: 700; font-size: 20px;\
                margin: 0 auto 16px;\
            }\
            #auth-box h2 {\
                color: #07374F; font-size: 22px; margin-bottom: 6px;\
            }\
            #auth-box p {\
                color: #6b6b6b; font-size: 14px; margin-bottom: 24px;\
            }\
            #auth-password {\
                width: 100%; padding: 12px 16px; border: 2px solid #ddd; border-radius: 8px;\
                font-size: 16px; font-family: inherit; outline: none; margin-bottom: 12px;\
            }\
            #auth-password:focus { border-color: #07374F; }\
            #auth-form button {\
                width: 100%; padding: 12px; background: #07374F; color: #eaff6a;\
                border: none; border-radius: 8px; font-size: 16px; font-weight: 600;\
                cursor: pointer; font-family: inherit;\
            }\
            #auth-form button:hover { background: #0e5f87; }\
            #auth-error {\
                color: #c0392b; font-size: 13px; margin-top: 10px; min-height: 18px;\
            }\
        ';

        document.head.appendChild(style);

        var originalContent = document.body.innerHTML;
        document.body.innerHTML = '';
        document.body.appendChild(overlay);

        document.getElementById('auth-form').addEventListener('submit', function(e) {
            e.preventDefault();
            var input = document.getElementById('auth-password').value;
            if (input === PASSWORD) {
                sessionStorage.setItem(SESSION_KEY, 'true');
                document.body.innerHTML = originalContent;
                style.remove();
            } else {
                document.getElementById('auth-error').textContent = 'Incorrect password';
                document.getElementById('auth-password').value = '';
                document.getElementById('auth-password').focus();
            }
        });
    });
})();
