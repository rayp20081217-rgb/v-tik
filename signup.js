```javascript
// ===============================
// V-Tik Signup System
// LocalStorage Account System
// ===============================

const signupForm = document.getElementById("signupForm");

const nameInput = document.getElementById("name");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const confirmPasswordInput =
    document.getElementById("confirmPassword");

const message = document.getElementById("message");


// =================================
// Get all registered users
// =================================

function getUsers() {

    const savedUsers =
        localStorage.getItem("vtik_users");

    if (!savedUsers) {
        return [];
    }

    try {
        return JSON.parse(savedUsers);
    } catch (error) {
        return [];
    }
}


// =================================
// Save users
// =================================

function saveUsers(users) {

    localStorage.setItem(
        "vtik_users",
        JSON.stringify(users)
    );
}


// =================================
// Show message
// =================================

function showMessage(text, type) {

    message.textContent = text;

    message.className = "message " + type;
}


// =================================
// Signup
// =================================

signupForm.addEventListener(
    "submit",
    function (event) {

        event.preventDefault();

        message.className = "message";
        message.textContent = "";


        // IMPORTANT:
        // Do not trim or lowercase username.
        // This makes username case-sensitive.

        const name = nameInput.value.trim();
        const username = usernameInput.value;
        const password = passwordInput.value;
        const confirmPassword =
            confirmPasswordInput.value;


        // =================================
        // Basic validation
        // =================================

        if (name === "") {

            showMessage(
                "Please enter your full name.",
                "error"
            );

            nameInput.focus();
            return;
        }


        if (username === "") {

            showMessage(
                "Please choose a username.",
                "error"
            );

            usernameInput.focus();
            return;
        }


        if (username.length < 3) {

            showMessage(
                "Username must be at least 3 characters.",
                "error"
            );

            usernameInput.focus();
            return;
        }


        if (password.length < 6) {

            showMessage(
                "Password must be at least 6 characters.",
                "error"
            );

            passwordInput.focus();
            return;
        }


        if (password !== confirmPassword) {

            showMessage(
                "Passwords do not match.",
                "error"
            );

            confirmPasswordInput.focus();
            return;
        }


        // =================================
        // Get existing accounts
        // =================================

        const users = getUsers();


        // =================================
        // Exact username check
        // =================================

        const existingUser = users.find(
            function (user) {

                return user.username === username;

            }
        );


        if (existingUser) {

            showMessage(
                "That username is already taken.",
                "error"
            );

            usernameInput.focus();
            return;
        }


        // =================================
        // Create new account
        // =================================

        const newUser = {

            id: Date.now(),

            name: name,

            username: username,

            password: password,

            bio: "Welcome to my V-Tik profile 🎬",

            photo:
                "https://i.pravatar.cc/200?img=12",

            videos: [],

            followers: 0,

            following: 0,

            likes: 0,

            createdAt:
                new Date().toISOString()

        };


        // =================================
        // Add account
        // =================================

        users.push(newUser);


        // =================================
        // Save account to LocalStorage
        // =================================

        saveUsers(users);


        // =================================
        // Success message
        // =================================

        showMessage(
            "Account created successfully! Redirecting to login...",
            "success"
        );


        // =================================
        // Clear form
        // =================================

        signupForm.reset();


        // =================================
        // Go to login
        // =================================

        setTimeout(function () {

            window.location.href = "login.html";

        }, 1500);

    }
);


// =================================
// Show / Hide password
// =================================

const passwordToggle =
    document.getElementById("passwordToggle");

if (passwordToggle) {

    passwordToggle.addEventListener(
        "click",
        function () {

            if (
                passwordInput.type ===
                "password"
            ) {

                passwordInput.type = "text";

                passwordToggle.textContent =
                    "🙈";

            } else {

                passwordInput.type =
                    "password";

                passwordToggle.textContent =
                    "👁️";
            }

        }
    );
}


// =================================
// Show / Hide confirm password
// =================================

const confirmPasswordToggle =
    document.getElementById(
        "confirmPasswordToggle"
    );

if (confirmPasswordToggle) {

    confirmPasswordToggle.addEventListener(
        "click",
        function () {

            if (
                confirmPasswordInput.type ===
                "password"
            ) {

                confirmPasswordInput.type =
                    "text";

                confirmPasswordToggle.textContent =
                    "🙈";

            } else {

                confirmPasswordInput.type =
                    "password";

                confirmPasswordToggle.textContent =
                    "👁️";
            }

        }
    );
}
```
