```javascript
// ===============================
// V-Tik Login System
// ===============================

const DEMO_USERNAME = "trippler";
const DEMO_PASSWORD = "123456";

const loginForm = document.getElementById("loginForm");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const errorMessage = document.getElementById("errorMessage");
const rememberMe = document.getElementById("rememberMe");

// Show error
function showError(message) {
    if (errorMessage) {
        errorMessage.textContent = message;
        errorMessage.style.display = "block";
    }
}

// Hide error
function hideError() {
    if (errorMessage) {
        errorMessage.textContent = "";
        errorMessage.style.display = "none";
    }
}

// Login
loginForm.addEventListener("submit", function (event) {
    event.preventDefault();

    hideError();

    const username = usernameInput.value.trim().toLowerCase();
    const password = passwordInput.value;

    if (username === "") {
        showError("Please enter your username.");
        usernameInput.focus();
        return;
    }

    if (password === "") {
        showError("Please enter your password.");
        passwordInput.focus();
        return;
    }

    // Check username and password
    if (
        username === DEMO_USERNAME ||
        username === "tripple r"
    ) {
        if (password === DEMO_PASSWORD) {

            // Save login status
            localStorage.setItem("vtik_logged_in", "true");
            localStorage.setItem("vtik_current_user", "trippler");

            // Save profile information
            localStorage.setItem(
                "vtik_name",
                "TRIPPLE R"
            );

            localStorage.setItem(
                "vtik_username",
                "trippler"
            );

            localStorage.setItem(
                "vtik_bio",
                "V-Tik creator 🎬\nMusic • Entertainment • Lifestyle"
            );

            // Remember login
            if (rememberMe && rememberMe.checked) {
                localStorage.setItem("vtik_remember", "true");
            } else {
                localStorage.removeItem("vtik_remember");
            }

            // Open accounts page
            window.location.href = "accounts.html";

        } else {
            showError("Incorrect password.");
            passwordInput.focus();
        }

    } else {
        showError("Username not found.");
        usernameInput.focus();
    }
});

// Password show/hide
const passwordToggle = document.getElementById("passwordToggle");

if (passwordToggle) {
    passwordToggle.addEventListener("click", function () {

        if (passwordInput.type === "password") {
            passwordInput.type = "text";
            passwordToggle.textContent = "🙈";
        } else {
            passwordInput.type = "password";
            passwordToggle.textContent = "👁️";
        }

    });
}

// Demo login button
const demoLogin = document.getElementById("demoLogin");

if (demoLogin) {
    demoLogin.addEventListener("click", function () {

        usernameInput.value = DEMO_USERNAME;
        passwordInput.value = DEMO_PASSWORD;

        localStorage.setItem("vtik_logged_in", "true");
        localStorage.setItem("vtik_current_user", "trippler");
        localStorage.setItem("vtik_remember", "true");

        localStorage.setItem("vtik_name", "TRIPPLE R");
        localStorage.setItem("vtik_username", "trippler");
        localStorage.setItem(
            "vtik_bio",
            "V-Tik creator 🎬\nMusic • Entertainment • Lifestyle"
        );

        window.location.href = "accounts.html";
    });
});
```

### Login details

Use:

**Username**

```text
trippler
```

or

```text
tripple r
```

**Password**

```text
123456
```

When these are correct, the user is sent to:

```text
accounts.html
```

If the username or password is wrong, they **stay on the login page** and see an error.

### Also protect `accounts.html`

At the very beginning of your `accounts.js`, add:

```javascript
// ===============================
// V-Tik Authentication Protection
// ===============================

const loggedIn = localStorage.getItem("vtik_logged_in");

if (loggedIn !== "true") {
    window.location.replace("login.html");
}
```

This means someone cannot simply type:

```text
accounts.html
```

into the browser and access the account without logging in.

**Important:** this is still a demo login using `localStorage`. For a real V-Tik app with real users, passwords and accounts should be handled by a proper authentication backend, not stored in browser JavaScript.
