/*  Revenue Kitchen — Supabase Auth Gate
    Included on every page via <script src="auth.js"></script>
    Requires the Supabase JS SDK to be loaded first (loaded inline below).
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
        '#rk-auth-box .rk-toggle{color:#07374F;font-size:13px;margin-top:16px;cursor:pointer;text-decoration:underline;background:none;border:none;font-family:inherit}' +
        '#rk-auth-box .rk-toggle:hover{color:#0e5f87}' +
        '#rk-auth-box .rk-name-row{display:flex;gap:8px}' +
        '#rk-auth-box .rk-name-row input{width:50%}' +
        '#rk-auth-box .rk-signout{position:absolute;top:16px;right:16px;background:none;border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.5);padding:6px 14px;border-radius:6px;font-size:12px;cursor:pointer;font-family:"IBM Plex Mono",monospace}' +
        '#rk-auth-box .rk-signout:hover{color:#fff;border-color:rgba(255,255,255,.5)}';
    document.head.appendChild(style);

    // ── Build overlay immediately so page is blocked ──
    var overlay = document.createElement('div');
    overlay.id = 'rk-auth-overlay';
    overlay.innerHTML =
        '<div id="rk-auth-box">' +
            '<div class="rk-logo">RK</div>' +
            '<h2>Revenue Kitchen</h2>' +
            '<p class="rk-sub" id="rk-auth-sub">Sign in to continue</p>' +
            '<!-- Login form -->' +
            '<form id="rk-login-form">' +
                '<input type="email" id="rk-email" placeholder="Email" autofocus>' +
                '<input type="password" id="rk-password" placeholder="Password">' +
                '<button type="submit" class="rk-btn" id="rk-submit-btn">Sign In</button>' +
                '<div class="rk-error" id="rk-error"></div>' +
            '</form>' +
            '<!-- Signup form (hidden) -->' +
            '<form id="rk-signup-form" style="display:none">' +
                '<div class="rk-name-row">' +
                    '<input type="text" id="rk-first" placeholder="First name">' +
                    '<input type="text" id="rk-last" placeholder="Last name">' +
                '</div>' +
                '<input type="email" id="rk-signup-email" placeholder="Email">' +
                '<input type="password" id="rk-signup-pw" placeholder="Create password (min 6 chars)">' +
                '<button type="submit" class="rk-btn" id="rk-signup-btn">Create Account</button>' +
                '<div class="rk-error" id="rk-signup-error"></div>' +
            '</form>' +
            '<button class="rk-toggle" id="rk-toggle">First time? Create an account</button>' +
        '</div>';

    // Append overlay as soon as possible
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

        // Expose for other scripts (leadership tab, user management)
        window.rkSupabase = sb;

        // Check existing session
        sb.auth.getSession().then(function (res) {
            var session = res.data.session;
            if (session) {
                // Check if user is disabled
                checkDisabled(sb, session.user, function (blocked) {
                    if (blocked) {
                        sb.auth.signOut();
                        showDisabledMessage();
                        return;
                    }
                    overlay.remove();
                    window.rkUser = session.user;
                    window.dispatchEvent(new CustomEvent('rk-auth-ready', { detail: session.user }));
                });
                return;
            }
            // No session — show login
            wireUpForms(sb);
        });

        // Listen for auth changes (handles tab focus returning etc.)
        sb.auth.onAuthStateChange(function (event, session) {
            if (event === 'SIGNED_IN' && session) {
                checkDisabled(sb, session.user, function (blocked) {
                    if (blocked) {
                        sb.auth.signOut();
                        showDisabledMessage();
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
            if (res.error || !res.data) return cb(false); // no profile yet = not disabled
            cb(res.data.disabled === true);
        });
    }

    function showDisabledMessage() {
        var box = document.getElementById('rk-auth-box');
        if (!box) return;
        box.innerHTML =
            '<div class="rk-logo">RK</div>' +
            '<h2>Account Disabled</h2>' +
            '<p class="rk-sub">Your access has been revoked. Contact an admin if this is a mistake.</p>';
    }

    function wireUpForms(sb) {
        var loginForm = document.getElementById('rk-login-form');
        var signupForm = document.getElementById('rk-signup-form');
        var toggle = document.getElementById('rk-toggle');
        var sub = document.getElementById('rk-auth-sub');
        var isSignup = false;

        toggle.addEventListener('click', function () {
            isSignup = !isSignup;
            loginForm.style.display = isSignup ? 'none' : '';
            signupForm.style.display = isSignup ? '' : 'none';
            sub.textContent = isSignup ? 'Create your account' : 'Sign in to continue';
            toggle.textContent = isSignup ? 'Already have an account? Sign in' : 'First time? Create an account';
        });

        // Login
        loginForm.addEventListener('submit', function (e) {
            e.preventDefault();
            var email = document.getElementById('rk-email').value.trim();
            var pw = document.getElementById('rk-password').value;
            var err = document.getElementById('rk-error');
            var btn = document.getElementById('rk-submit-btn');
            err.textContent = '';
            btn.disabled = true;
            btn.textContent = 'Signing in…';

            sb.auth.signInWithPassword({ email: email, password: pw }).then(function (res) {
                btn.disabled = false;
                btn.textContent = 'Sign In';
                if (res.error) {
                    err.textContent = res.error.message;
                }
                // success handled by onAuthStateChange
            });
        });

        // Signup
        signupForm.addEventListener('submit', function (e) {
            e.preventDefault();
            var first = document.getElementById('rk-first').value.trim();
            var last = document.getElementById('rk-last').value.trim();
            var email = document.getElementById('rk-signup-email').value.trim();
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
                btn.disabled = false;
                btn.textContent = 'Create Account';
                if (res.error) {
                    err.textContent = res.error.message;
                } else if (res.data.user && !res.data.session) {
                    // Email confirmation required
                    err.style.color = '#07374F';
                    err.textContent = 'Check your email to confirm your account, then sign in.';
                }
                // If auto-confirmed, onAuthStateChange handles it
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
