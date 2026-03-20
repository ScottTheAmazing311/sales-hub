/*  Revenue Kitchen — Supabase Auth Gate (Allowlist-based)
    Included on every page via <script src="auth.js"></script>
    Users must be on the allowlist to create an account. No email confirmation needed.
*/
(function () {
    var SUPABASE_URL = 'https://ryxrgbvymudmqqpefmmf.supabase.co';
    var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5eHJnYnZ5bXVkbXFxcGVmbW1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyMDM5MTEsImV4cCI6MjA4Njc3OTkxMX0.o9TKcIBHO4whilqiqKoHrGmRR8BCuCzgzwI0quA75H0';

    // ── Inject Supabase SDK if not already loaded ──
    function loadSupabase(cb) {
        if (window.supabase) return cb();
        var s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
        s.onload = cb;
        document.head.appendChild(s);
    }

    // ── Styles ──
    var style = document.createElement('style');
    style.textContent =
        '#rk-auth-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:#07374F;z-index:99999;display:flex;align-items:center;justify-content:center;font-family:"IBM Plex Sans",sans-serif}' +
        '#rk-auth-box{background:#fefaed;border-radius:12px;padding:48px 40px;text-align:center;width:380px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,.3)}' +
        '#rk-auth-box .rk-logo{width:56px;height:56px;background:#07374F;color:#eaff6a;border-radius:10px;display:flex;align-items:center;justify-content:center;font-family:"IBM Plex Mono",monospace;font-weight:700;font-size:20px;margin:0 auto 16px}' +
        '#rk-auth-box h2{color:#07374F;font-size:22px;margin-bottom:6px}' +
        '#rk-auth-box .rk-sub{color:#6b6b6b;font-size:14px;margin-bottom:24px}' +
        '#rk-auth-box input{width:100%;padding:12px 16px;border:2px solid #ddd;border-radius:8px;font-size:16px;font-family:inherit;outline:none;margin-bottom:12px;box-sizing:border-box}' +
        '#rk-auth-box input:focus{border-color:#07374F}' +
        '#rk-auth-box .rk-btn{width:100%;padding:12px;background:#07374F;color:#eaff6a;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;font-family:inherit}' +
        '#rk-auth-box .rk-btn:hover{background:#0e5f87}' +
        '#rk-auth-box .rk-btn:disabled{opacity:.5;cursor:not-allowed}' +
        '#rk-auth-box .rk-error{color:#c0392b;font-size:13px;margin-top:10px;min-height:18px}' +
        '#rk-auth-box .rk-success{color:#07374F;font-size:13px;margin-top:10px;min-height:18px}' +
        '#rk-auth-box .rk-toggle{color:#07374F;font-size:13px;margin-top:16px;cursor:pointer;text-decoration:underline;background:none;border:none;font-family:inherit}' +
        '#rk-auth-box .rk-toggle:hover{color:#0e5f87}' +
        '#rk-auth-box .rk-name-row{display:flex;gap:8px}' +
        '#rk-auth-box .rk-name-row input{width:50%}';
    document.head.appendChild(style);

    // ── Build overlay immediately so page is blocked ──
    var overlay = document.createElement('div');
    overlay.id = 'rk-auth-overlay';
    overlay.innerHTML =
        '<div id="rk-auth-box">' +
            '<div class="rk-logo">RK</div>' +
            '<h2>Revenue Kitchen</h2>' +
            '<p class="rk-sub" id="rk-auth-sub">Sign in to continue</p>' +

            '<!-- Step 1: Email check -->' +
            '<form id="rk-email-form">' +
                '<input type="email" id="rk-email" placeholder="Enter your email" autofocus>' +
                '<button type="submit" class="rk-btn" id="rk-email-btn">Continue</button>' +
                '<div class="rk-error" id="rk-email-error"></div>' +
            '</form>' +

            '<!-- Step 2a: Returning user — password -->' +
            '<form id="rk-login-form" style="display:none">' +
                '<input type="email" id="rk-login-email" disabled>' +
                '<input type="password" id="rk-password" placeholder="Password" autofocus>' +
                '<button type="submit" class="rk-btn" id="rk-submit-btn">Sign In</button>' +
                '<div class="rk-error" id="rk-login-error"></div>' +
                '<button type="button" class="rk-toggle" id="rk-back-login">&larr; Use a different email</button>' +
            '</form>' +

            '<!-- Step 2b: New user — set up account -->' +
            '<form id="rk-signup-form" style="display:none">' +
                '<div class="rk-name-row">' +
                    '<input type="text" id="rk-first" placeholder="First name">' +
                    '<input type="text" id="rk-last" placeholder="Last name">' +
                '</div>' +
                '<input type="email" id="rk-signup-email" disabled>' +
                '<input type="password" id="rk-signup-pw" placeholder="Create password (min 6 chars)">' +
                '<button type="submit" class="rk-btn" id="rk-signup-btn">Create Account</button>' +
                '<div class="rk-error" id="rk-signup-error"></div>' +
                '<button type="button" class="rk-toggle" id="rk-back-signup">&larr; Use a different email</button>' +
            '</form>' +
        '</div>';

    if (document.body) {
        document.body.appendChild(overlay);
    } else {
        document.addEventListener('DOMContentLoaded', function () {
            document.body.appendChild(overlay);
        });
    }

    // ── Auth logic ──
    loadSupabase(function () {
        var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        window.rkSupabase = sb;

        // Check existing session
        sb.auth.getSession().then(function (res) {
            var session = res.data.session;
            if (session) {
                checkDisabled(sb, session.user, function (blocked) {
                    if (blocked) {
                        sb.auth.signOut();
                        showMessage('Account Disabled', 'Your access has been revoked. Contact an admin if this is a mistake.');
                        return;
                    }
                    overlay.remove();
                    window.rkUser = session.user;
                    window.dispatchEvent(new CustomEvent('rk-auth-ready', { detail: session.user }));
                });
                return;
            }
            wireUpForms(sb);
        });

        sb.auth.onAuthStateChange(function (event, session) {
            if (event === 'SIGNED_IN' && session) {
                checkDisabled(sb, session.user, function (blocked) {
                    if (blocked) {
                        sb.auth.signOut();
                        showMessage('Account Disabled', 'Your access has been revoked. Contact an admin if this is a mistake.');
                        return;
                    }
                    overlay.remove();
                    window.rkUser = session.user;
                    window.dispatchEvent(new CustomEvent('rk-auth-ready', { detail: session.user }));
                });
            }
            if (event === 'SIGNED_OUT') {
                location.reload();
            }
        });
    });

    function checkDisabled(sb, user, cb) {
        sb.from('profiles').select('disabled').eq('id', user.id).single().then(function (res) {
            if (res.error || !res.data) return cb(false);
            cb(res.data.disabled === true);
        });
    }

    function showMessage(title, msg) {
        var box = document.getElementById('rk-auth-box');
        if (!box) return;
        box.innerHTML =
            '<div class="rk-logo">RK</div>' +
            '<h2>' + title + '</h2>' +
            '<p class="rk-sub">' + msg + '</p>';
    }

    function wireUpForms(sb) {
        var emailForm = document.getElementById('rk-email-form');
        var loginForm = document.getElementById('rk-login-form');
        var signupForm = document.getElementById('rk-signup-form');
        var sub = document.getElementById('rk-auth-sub');

        // Step 1: Check email against allowlist
        emailForm.addEventListener('submit', function (e) {
            e.preventDefault();
            var email = document.getElementById('rk-email').value.trim().toLowerCase();
            var err = document.getElementById('rk-email-error');
            var btn = document.getElementById('rk-email-btn');
            err.textContent = '';

            if (!email) return;

            btn.disabled = true;
            btn.textContent = 'Checking…';

            // Check allowlist
            sb.from('allowed_emails').select('email').eq('email', email).single().then(function (res) {
                btn.disabled = false;
                btn.textContent = 'Continue';

                if (res.error || !res.data) {
                    err.textContent = "You're not on the approved list. Slack Scott to be added.";
                    return;
                }

                // Email is on the allowlist — check if they already have an account
                // Try signing in with a dummy password to see if account exists
                // (Supabase returns different errors for "user not found" vs "wrong password")
                sb.auth.signInWithPassword({ email: email, password: '___check___' }).then(function (signInRes) {
                    if (signInRes.error) {
                        var msg = signInRes.error.message.toLowerCase();
                        if (msg.indexOf('invalid login credentials') !== -1) {
                            // Account exists — show login form
                            emailForm.style.display = 'none';
                            loginForm.style.display = '';
                            document.getElementById('rk-login-email').value = email;
                            document.getElementById('rk-password').focus();
                            sub.textContent = 'Welcome back — enter your password';
                        } else {
                            // No account yet — show signup form
                            emailForm.style.display = 'none';
                            signupForm.style.display = '';
                            document.getElementById('rk-signup-email').value = email;
                            document.getElementById('rk-first').focus();
                            sub.textContent = 'Set up your account';
                        }
                    }
                    // If somehow it succeeded with dummy password... shouldn't happen
                });
            });
        });

        // Back buttons
        document.getElementById('rk-back-login').addEventListener('click', function () {
            loginForm.style.display = 'none';
            emailForm.style.display = '';
            sub.textContent = 'Sign in to continue';
            document.getElementById('rk-email').focus();
        });
        document.getElementById('rk-back-signup').addEventListener('click', function () {
            signupForm.style.display = 'none';
            emailForm.style.display = '';
            sub.textContent = 'Sign in to continue';
            document.getElementById('rk-email').focus();
        });

        // Step 2a: Login
        loginForm.addEventListener('submit', function (e) {
            e.preventDefault();
            var email = document.getElementById('rk-login-email').value;
            var pw = document.getElementById('rk-password').value;
            var err = document.getElementById('rk-login-error');
            var btn = document.getElementById('rk-submit-btn');
            err.textContent = '';
            btn.disabled = true;
            btn.textContent = 'Signing in…';

            sb.auth.signInWithPassword({ email: email, password: pw }).then(function (res) {
                btn.disabled = false;
                btn.textContent = 'Sign In';
                if (res.error) {
                    err.textContent = 'Incorrect password';
                }
            });
        });

        // Step 2b: Signup — create account then auto sign in
        signupForm.addEventListener('submit', function (e) {
            e.preventDefault();
            var first = document.getElementById('rk-first').value.trim();
            var last = document.getElementById('rk-last').value.trim();
            var email = document.getElementById('rk-signup-email').value;
            var pw = document.getElementById('rk-signup-pw').value;
            var err = document.getElementById('rk-signup-error');
            var btn = document.getElementById('rk-signup-btn');
            err.textContent = '';

            if (!first || !last) { err.textContent = 'Please enter your name'; return; }
            if (pw.length < 6) { err.textContent = 'Password must be at least 6 characters'; return; }

            btn.disabled = true;
            btn.textContent = 'Creating account…';

            sb.auth.signUp({
                email: email,
                password: pw,
                options: {
                    data: { first_name: first, last_name: last }
                }
            }).then(function (res) {
                if (res.error) {
                    btn.disabled = false;
                    btn.textContent = 'Create Account';
                    err.textContent = res.error.message;
                    return;
                }

                // If auto-confirmed (trigger set email_confirmed_at), session exists
                if (res.data.session) {
                    // onAuthStateChange will handle it
                    return;
                }

                // If not auto-confirmed, try signing in immediately
                // (the BEFORE INSERT trigger should have confirmed them)
                sb.auth.signInWithPassword({ email: email, password: pw }).then(function (signInRes) {
                    btn.disabled = false;
                    btn.textContent = 'Create Account';
                    if (signInRes.error) {
                        err.textContent = 'Account created but sign-in failed. Try signing in manually.';
                        // Show login form
                        signupForm.style.display = 'none';
                        loginForm.style.display = '';
                        document.getElementById('rk-login-email').value = email;
                        document.getElementById('rk-password').focus();
                        sub.textContent = 'Enter your password to sign in';
                    }
                });
            });
        });
    }

    // ── Global sign-out helper ──
    window.rkSignOut = function () {
        if (window.rkSupabase) {
            window.rkSupabase.auth.signOut();
        }
    };
})();
