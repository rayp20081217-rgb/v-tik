
"use strict";

/* =========================================
   V-TIK LOGIN SYSTEM
   Saved users, login, demo login and validation
========================================= */

const DEMO_USERNAME = "trippler";
const DEMO_PASSWORD = "123456";

const USERS_KEY = "vtik_users";
const LOGIN_KEY = "vtik_logged_in";
const CURRENT_USER_KEY = "vtik_current_user";
const REMEMBER_KEY = "vtik_remember";

const loginForm = document.getElementById("loginForm");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const errorMessage = document.getElementById("errorMessage");
const rememberMe = document.getElementById("rememberMe");
const loginButton = document.getElementById("loginButton");
const buttonText = document.getElementById("buttonText");
const demoLogin = document.getElementById("demoLogin");
const togglePassword = document.getElementById("togglePassword");
const forgotPassword = document.getElementById("forgotPassword");

/* =========================================
   STORAGE HELPERS
========================================= */

function getUsers() {
    try {
        const storedUsers = JSON.parse(
            localStorage.getItem(USERS_KEY) || "[]"
        );

        return Array.isArray(storedUsers) ? storedUsers : [];
    } catch (error) {
        console.error("Could not read saved users:", error);
        return [];
    }
}

function saveUsers(users) {
    try {
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
        return true;
    } catch (error) {
        console.error("Could not save users:", error);
        showError("Could not save account data in this browser.");
        return false;
    }
}

/* =========================================
   ERROR MESSAGES
========================================= */

function showError(message) {
    if (!errorMessage) return;

    errorMessage.textContent = message;
    errorMessage.classList.add("show");
}

function hideError() {
    if (!errorMessage) return;

    errorMessage.textContent = "";
    errorMessage.classList.remove("show");
}

/* =========================================
   CREATE DEMO ACCOUNT
========================================= */

function ensureDemoUser() {
    const users = getUsers();

    const existingUser = users.find(
        user =>
            typeof user.username === "string" &&
            user.username.toLowerCase() === DEMO_USERNAME
    );

    if (existingUser) return;

    users.push({
        username: DEMO_USERNAME,
        name: "TRIPPLE R",
        bio: "V-Tik creator 🎬\nMusic • Entertainment • Lifestyle",
        password: DEMO_PASSWORD
    });

    saveUsers(users);
}

ensureDemoUser();

/* =========================================
   START LOGIN SESSION
========================================= */

function startSession(user, shouldRemember) {
    try {
        localStorage.setItem(LOGIN_KEY, "true");
        localStorage.setItem(CURRENT_USER_KEY, user.username);

        localStorage.setItem(
            "vtik_name",
            user.name || user.username
        );

        localStorage.setItem(
            "vtik_username",
            user.username
        );

        localStorage.setItem(
            "vtik_bio",
            user.bio || "V-Tik creator 🎬"
        );

        if (shouldRemember) {
            localStorage.setItem(REMEMBER_KEY, "true");
        } else {
            localStorage.removeItem(REMEMBER_KEY);
        }

        window.location.href = "account.html";
    } catch (error) {
        console.error("Could not start login session:", error);
        showError("Unable to log in. Please check your browser storage.");
    }
}

/* =========================================
   LOGIN FORM
========================================= */

if (loginForm) {
    loginForm.addEventListener("submit", event => {
        event.preventDefault();
        hideError();

        const username = usernameInput.value.trim().toLowerCase();
        const password = passwordInput.value;

        if (!username) {
            showError("Please enter your username or email.");
            usernameInput.focus();
            return;
        }

        if (!password) {
            showError("Please enter your password.");
            passwordInput.focus();
            return;
        }

        // Support the demo account's alternate username.
        const normalizedUsername =
            username === "tripple r" ? DEMO_USERNAME : username;

        const users = getUsers();

        const user = users.find(item =>
            typeof item.username === "string" &&
            item.username.toLowerCase() === normalizedUsername &&
            item.password === password
        );

        if (!user) {
            showError("Username or password is incorrect.");
            passwordInput.focus();
            return;
        }

        startSession(user, Boolean(rememberMe?.checked));
    });
}

/* =========================================
   SHOW / HIDE PASSWORD
========================================= */

if (togglePassword && passwordInput) {
    togglePassword.addEventListener("click", () => {
        const shouldShow = passwordInput.type === "password";

        passwordInput.type = shouldShow ? "text" : "password";
        togglePassword.textContent = shouldShow ? "🙈" : "👁";

        togglePassword.setAttribute(
            "aria-label",
            shouldShow ? "Hide password" : "Show password"
        );
    });
}

/* =========================================
   DEMO LOGIN
========================================= */

if (demoLogin) {
    demoLogin.addEventListener("click", () => {
        hideError();

        ensureDemoUser();

        const demoUser = getUsers().find(
            user => user.username === DEMO_USERNAME
        );

        if (!demoUser) {
            showError("Could not load the demo account.");
            return;
        }

        if (usernameInput) usernameInput.value = DEMO_USERNAME;
        if (passwordInput) passwordInput.value = DEMO_PASSWORD;
        if (rememberMe) rememberMe.checked = true;

        startSession(demoUser, true);
    });
}

/* =========================================
   REMEMBER ME
   Remembers the username, never the password.
========================================= */

function restoreRememberedUser() {
    if (localStorage.getItem(REMEMBER_KEY) !== "true") return;

    const savedUsername = localStorage.getItem(CURRENT_USER_KEY);

    if (savedUsername && usernameInput) {
        usernameInput.value = savedUsername;
    }

    if (rememberMe) {
        rememberMe.checked = true;
    }
}

restoreRememberedUser();

/* =========================================
   FORGOT PASSWORD
========================================= */

if (forgotPassword) {
    forgotPassword.addEventListener("click", event => {
        event.preventDefault();

        showError(
            "Password recovery is not available yet. Please use your demo account or contact the app administrator."
        );
    });
}

/* =========================================
   BUTTON LOADING STATE
========================================= */

if (loginForm && loginButton) {
    loginForm.addEventListener("submit", () => {
        // The submit handler above validates the credentials.
        // Do not disable the button here because invalid logins
        // must remain easy to retry.
    });
}

/* =========================================
   OPTIONAL GLOBAL HELPERS
   Useful for testing from the browser console.
========================================= */

window.VTikLogin = {
    getUsers,
    saveUsers
};

console.log("V-Tik login system ready.");
