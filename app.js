
"use strict";

/* =========================================================
   V-TIK — COMPLETE FRONT-END APP
   Feed • Videos • Likes • Saves • Comments • Follows
   Search • Uploads • Fullscreen viewer • Mobile navigation
========================================================= */

(() => {
    /* 1. SAFE DOM HELPERS */

    const $ = (selector, parent = document) => {
        if (!parent || typeof parent.querySelector !== "function") return null;
        return parent.querySelector(selector);
    };

    const $$ = (selector, parent = document) => {
        if (!parent || typeof parent.querySelectorAll !== "function") return [];
        return Array.from(parent.querySelectorAll(selector));
    };

    const byId = (id) => document.getElementById(id);

    const escapeHTML = (value = "") =>
        String(value).replace(/[&<>"']/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[char]);

    const makeId = () =>
        `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const formatCount = (number = 0) => {
        const value = Number(number) || 0;
        if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
        if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
        return String(value);
    };

    const safeText = (value, fallback = "") =>
        typeof value === "string" && value.trim() ? value.trim() : fallback;

    const $on = (element, event, callback, options) => {
        if (element && typeof element.addEventListener === "function") {
            element.addEventListener(event, callback, options);
        }
    };

    /* 2. APP ELEMENTS */

    const feed = byId("feed") || $(".feed");
    const searchInput = $(".search input, #searchInput, #search");
    const profileButton = byId("profileButton") || $(".profile-button");
    const mobileProfile = byId("mobileProfile");

    const createModal = byId("createModal") || byId("uploadModal");
    const commentsModal = byId("commentsModal");
    const viewer = byId("videoViewer") || byId("fullscreenViewer");

    const currentUser = {
        id: "vtik-current-user",
        username: "you",
        displayName: "V-Tik User",
        avatar: "😎"
    };

    /* 3. STORAGE */

    const STORAGE_KEY = "vtik_app_state_v1";
    const VIDEO_DB_NAME = "vtik_video_storage";
    const VIDEO_STORE_NAME = "videos";

    const defaultVideos = [
        {
            id: "demo-1",
            username: "vtik_creator",
            displayName: "V-Tik Creator",
            avatar: "✨",
            caption: "Welcome to V-Tik! Your next favorite video is here. 💖",
            music: "Original sound",
            src: "vtik-demo-1.mp4",
            likes: 128,
            comments: [{
                id: makeId(),
                username: "happyviewer",
                avatar: "😊",
                text: "Welcome to V-Tik! 🔥",
                createdAt: Date.now()
            }],
            liked: false,
            saved: false,
            following: false,
            createdAt: Date.now() - 3000
        },
        {
            id: "demo-2",
            username: "daily_vibes",
            displayName: "Daily Vibes",
            avatar: "🌈",
            caption: "A little positivity can change your whole day. 🌟",
            music: "Good vibes",
            src: "vtik-demo-2.mp4",
            likes: 245,
            comments: [],
            liked: false,
            saved: false,
            following: false,
            createdAt: Date.now() - 2000
        },
        {
            id: "demo-3",
            username: "creative_minds",
            displayName: "Creative Minds",
            avatar: "🎨",
            caption: "Keep creating. Keep learning. Keep shining. 🚀",
            music: "Creative energy",
            src: "vtik-demo-3.mp4",
            likes: 89,
            comments: [],
            liked: false,
            saved: false,
            following: false,
            createdAt: Date.now() - 1000
        }
    ];

    function loadState() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);

            if (!saved) {
                return {
                    videos: defaultVideos.map((video) => ({ ...video })),
                    activeTab: "For You",
                    username: currentUser.username,
                    avatar: currentUser.avatar
                };
            }

            const parsed = JSON.parse(saved);

            return {
                videos: Array.isArray(parsed.videos)
                    ? parsed.videos
                    : defaultVideos.map((video) => ({ ...video })),
                activeTab: parsed.activeTab || "For You",
                username: parsed.username || currentUser.username,
                avatar: parsed.avatar || currentUser.avatar
            };
        } catch (error) {
            console.warn("V-Tik: could not load saved state.", error);

            return {
                videos: defaultVideos.map((video) => ({ ...video })),
                activeTab: "For You",
                username: currentUser.username,
                avatar: currentUser.avatar
            };
        }
    }

    const state = loadState();

    state.videos = state.videos.map((video) => ({
        comments: [],
        likes: 0,
        liked: false,
        saved: false,
        following: false,
        music: "Original sound",
        ...video,
        comments: Array.isArray(video.comments) ? video.comments : []
    }));

    let activeVideoId = null;
    let searchTerm = "";
    let currentObjectUrl = null;
    let dbPromise = null;
    let toastTimer = null;

    function saveState() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (error) {
            console.warn("V-Tik: state could not be saved.", error);
            showToast("Some changes could not be saved on this device.");
        }
    }

    function getVideo(videoId) {
        return state.videos.find((video) => video.id === videoId);
    }

    function getCurrentAvatar() {
        return safeText(state.avatar, currentUser.avatar);
    }

    /* 4. VIDEO FILE DATABASE */

    function openVideoDB() {
        if (!("indexedDB" in window)) {
            return Promise.reject(new Error("IndexedDB is not supported in this browser."));
        }

        if (dbPromise) return dbPromise;

        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(VIDEO_DB_NAME, 1);

            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(VIDEO_STORE_NAME)) {
                    db.createObjectStore(VIDEO_STORE_NAME, { keyPath: "id" });
                }
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        return dbPromise;
    }

    async function saveVideoFile(id, file) {
        const db = await openVideoDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(VIDEO_STORE_NAME, "readwrite");

            transaction.objectStore(VIDEO_STORE_NAME).put({
                id,
                file,
                name: file.name,
                type: file.type
            });

            transaction.oncomplete = () => resolve(true);
            transaction.onerror = () => reject(transaction.error);
        });
    }

    async function getVideoFile(id) {
        const db = await openVideoDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(VIDEO_STORE_NAME, "readonly");
            const request = transaction.objectStore(VIDEO_STORE_NAME).get(id);

            request.onsuccess = () => {
                resolve(request.result ? request.result.file : null);
            };

            request.onerror = () => reject(request.error);
        });
    }

    async function deleteVideoFile(id) {
        try {
            const db = await openVideoDB();

            await new Promise((resolve, reject) => {
                const transaction = db.transaction(VIDEO_STORE_NAME, "readwrite");
                transaction.objectStore(VIDEO_STORE_NAME).delete(id);
                transaction.oncomplete = resolve;
                transaction.onerror = () => reject(transaction.error);
            });
        } catch (error) {
            console.warn("V-Tik: video file could not be deleted.", error);
        }
    }

    async function resolveVideoSource(video) {
        if (!video) return "";

        if (video.uploaded && video.id) {
            try {
                const file = await getVideoFile(video.id);
                if (file) return URL.createObjectURL(file);
            } catch (error) {
                console.warn("V-Tik: uploaded video unavailable.", error);
            }

            return "";
        }

        return video.src || "";
    }

    /* 5. TOAST NOTIFICATIONS */

    function showToast(message) {
        let toast = byId("vtikToast");

        if (!toast) {
            toast = document.createElement("div");
            toast.id = "vtikToast";
            toast.className = "vtik-toast";
            toast.setAttribute("role", "status");
            toast.setAttribute("aria-live", "polite");
            document.body.appendChild(toast);
        }

        toast.textContent = message;
        toast.classList.add("show");

        if (toastTimer) clearTimeout(toastTimer);

        toastTimer = setTimeout(() => {
            toast.classList.remove("show");
        }, 2600);
    }

    /* 6. VIDEO CARD HTML */

    function videoCardHTML(video) {
        const username = safeText(video.username, "creator");
        const displayName = safeText(video.displayName, username);
        const avatar = safeText(video.avatar, "🙂");
        const caption = safeText(video.caption, "");
        const music = safeText(video.music, "Original sound");

        return `
            <article class="video-card" data-video-id="${escapeHTML(video.id)}">
                <div class="video-user">
                    <div class="avatar">${escapeHTML(avatar)}</div>
                    <div class="video-user-info">
                        <strong>@${escapeHTML(username)}</strong>
                        <span>${escapeHTML(displayName)}</span>
                    </div>

                    <button class="follow-btn ${video.following ? "following" : ""}"
                            data-action="follow"
                            data-video-id="${escapeHTML(video.id)}"
                            type="button">
                        ${video.following ? "Following" : "Follow"}
                    </button>
                </div>

                <div class="video-stage">
                    <video class="feed-video"
                           data-video-id="${escapeHTML(video.id)}"
                           src=""
                           preload="metadata"
                           playsinline
                           muted
                           loop
                           controls
                           aria-label="Video by ${escapeHTML(username)}">
                    </video>

                    <div class="video-loading" aria-hidden="true">
                        <span></span>
                    </div>

                    <button class="sound-toggle"
                            data-action="sound"
                            type="button"
                            aria-label="Toggle video sound">
                        🔊
                    </button>
                </div>

                <div class="video-details">
                    <div class="video-caption">
                        <strong>@${escapeHTML(username)}</strong>
                        ${escapeHTML(caption)}
                    </div>

                    <div class="video-music">
                        <span aria-hidden="true">♫</span>
                        ${escapeHTML(music)}
                    </div>

                    <div class="video-actions">
                        <button class="action-btn ${video.liked ? "active liked" : ""}"
                                data-action="like"
                                data-video-id="${escapeHTML(video.id)}"
                                type="button"
                                aria-label="Like video">
                            <span class="action-icon">${video.liked ? "♥" : "♡"}</span>
                            <span class="like-count">${formatCount(video.likes)}</span>
                        </button>

                        <button class="action-btn"
                                data-action="comment"
                                data-video-id="${escapeHTML(video.id)}"
                                type="button"
                                aria-label="Open comments">
                            <span class="action-icon">▢</span>
                            <span>${formatCount(video.comments.length)}</span>
                        </button>

                        <button class="action-btn ${video.saved ? "active saved" : ""}"
                                data-action="save"
                                data-video-id="${escapeHTML(video.id)}"
                                type="button"
                                aria-label="Save video">
                            <span class="action-icon">${video.saved ? "★" : "☆"}</span>
                            <span>${video.saved ? "Saved" : "Save"}</span>
                        </button>

                        <button class="action-btn"
                                data-action="share"
                                data-video-id="${escapeHTML(video.id)}"
                                type="button"
                                aria-label="Share video">
                            <span class="action-icon">↗</span>
                            <span>Share</span>
                        </button>

                        <button class="action-btn"
                                data-action="expand"
                                data-video-id="${escapeHTML(video.id)}"
                                type="button"
                                aria-label="Open fullscreen viewer">
                            <span class="action-icon">⛶</span>
                        </button>
                    </div>
                </div>
            </article>
        `;
    }

    /* 7. FEED FILTERING AND RENDERING */

    function getVisibleVideos() {
        let videos = [...state.videos];

        if (state.activeTab === "Following") {
            videos = videos.filter((video) => video.following);
        } else if (state.activeTab === "Saved") {
            videos = videos.filter((video) => video.saved);
        }

        if (searchTerm) {
            const term = searchTerm.toLowerCase();

            videos = videos.filter((video) => {
                const searchable = [
                    video.username,
                    video.displayName,
                    video.caption,
                    video.music
                ].join(" ").toLowerCase();

                return searchable.includes(term);
            });
        }

        return videos.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }

    function renderEmptyFeed(message) {
        if (!feed) return;

        feed.innerHTML = `
            <div class="empty-feed">
                <div class="empty-feed-icon">🎬</div>
                <h3>Nothing to show yet</h3>
                <p>${escapeHTML(message)}</p>
                <button class="btn btn-primary"
                        type="button"
                        data-action="open-create">
                    Create a video
                </button>
            </div>
        `;
    }

    function renderFeed() {
        if (!feed) {
            console.error('V-Tik: Add <main id="feed" class="feed"></main> to index.html.');
            showToast("Feed element is missing. Check index.html.");
            return;
        }

        const videos = getVisibleVideos();

        if (videos.length === 0) {
            let message = "Try another search or upload the first video.";

            if (state.activeTab === "Following") {
                message = "Follow creators to see their videos here.";
            } else if (state.activeTab === "Saved") {
                message = "Videos you save will appear here.";
            }

            renderEmptyFeed(message);
            updateProfileButton();
            return;
        }

        $$(".feed-video[data-object-url]", feed).forEach((oldVideo) => {
            const oldUrl = oldVideo.dataset.objectUrl;
            if (oldUrl) {
                try {
                    URL.revokeObjectURL(oldUrl);
                } catch (_) {}
            }
        });

        feed.innerHTML = videos.map(videoCardHTML).join("");
        updateProfileButton();

        setupVideoPlayback();
        loadFeedVideoSources();
    }

    async function loadFeedVideoSources() {
        const videoElements = $$(".feed-video", feed);

        for (const element of videoElements) {
            const videoId = element.dataset.videoId;
            const video = getVideo(videoId);
            if (!video) continue;

            const source = await resolveVideoSource(video);

            if (!element.isConnected) {
                if (source.startsWith("blob:")) URL.revokeObjectURL(source);
                continue;
            }

            if (!source) {
                element.poster = "";
                element.removeAttribute("src");
                element.load();

                const stage = element.closest(".video-stage");

                if (stage) {
                    stage.classList.add("video-unavailable");
                    let notice = $(".video-unavailable-message", stage);

                    if (!notice) {
                        notice = document.createElement("div");
                        notice.className = "video-unavailable-message";
                        notice.textContent = "Video file not found";
                        stage.appendChild(notice);
                    }
                }

                continue;
            }

            element.src = source;
            element.dataset.loaded = "true";
            element.classList.remove("video-source-error");
            element.load();

            if (source.startsWith("blob:")) {
                element.dataset.objectUrl = source;
            }

            const tryPlayWhenReady = () => {
                if (!element.isConnected || element.paused) {
                    const rect = element.getBoundingClientRect();
                    const visible = rect.width > 0 && rect.height > 0 &&
                        rect.bottom > 0 && rect.top < window.innerHeight;

                    if (visible && element.isConnected) {
                        element.muted = true;
                        const playPromise = element.play();

                        if (playPromise && typeof playPromise.catch === "function") {
                            playPromise.catch(() => {});
                        }
                    }
                }
            };

            element.addEventListener("loadeddata", tryPlayWhenReady, { once: true });
        }
    }

    function setupVideoPlayback() {
        const videos = $$(".feed-video", feed);

        if (!("IntersectionObserver" in window)) {
            videos.forEach((video) => {
                video.muted = true;

                const rect = video.getBoundingClientRect();
                const visible = rect.width > 0 && rect.height > 0 &&
                    rect.bottom > 0 && rect.top < window.innerHeight;

                if (visible) {
                    const playPromise = video.play();
                    if (playPromise && typeof playPromise.catch === "function") {
                        playPromise.catch(() => {});
                    }
                }
            });
            return;
        }

        if (window.vtikVideoObserver) {
            window.vtikVideoObserver.disconnect();
        }

        window.vtikVideoObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                const video = entry.target;

                if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
                    videos.forEach((otherVideo) => {
                        if (otherVideo !== video) otherVideo.pause();
                    });

                    const playPromise = video.play();

                    if (playPromise && typeof playPromise.catch === "function") {
                        playPromise.catch(() => {});
                    }
                } else {
                    video.pause();
                }
            });
        }, { threshold: [0, 0.6, 1] });

        videos.forEach((video) => {
            video.muted = true;
            window.vtikVideoObserver.observe(video);
        });
    }

    /* Continue with Part 2 below this line. */

    /* 8. PROFILE */

    function updateProfileButton() {
        const username = safeText(state.username, currentUser.username);
        const avatar = getCurrentAvatar();

        [profileButton, mobileProfile].forEach((button) => {
            if (!button) return;

            const avatarElement = $(".avatar, .profile-avatar", button);
            const nameElement = $(".username, .profile-name", button);

            if (avatarElement) avatarElement.textContent = avatar;
            if (nameElement) nameElement.textContent = `@${username}`;

            button.setAttribute("aria-label", `Profile: ${username}`);
        });
    }

    function openProfile() {
        const username = window.prompt(
            "Enter your username:",
            state.username || currentUser.username
        );

        if (username === null) return;

        const cleanUsername = username.trim().replace(/^@/, "");

        if (!cleanUsername) {
            showToast("Please enter a username.");
            return;
        }

        state.username = cleanUsername.slice(0, 30);
        saveState();
        updateProfileButton();
        showToast(`Welcome, @${state.username}!`);
    }

    /* 9. LIKES, SAVES AND FOLLOWS */

    function toggleLike(videoId) {
        const video = getVideo(videoId);
        if (!video) return;

        video.liked = !video.liked;
        video.likes = Math.max(
            0,
            (Number(video.likes) || 0) + (video.liked ? 1 : -1)
        );

        saveState();
        renderFeed();

        if (video.liked) showToast("You liked this video ❤️");
    }

    function toggleSave(videoId) {
        const video = getVideo(videoId);
        if (!video) return;

        video.saved = !video.saved;

        saveState();
        renderFeed();

        showToast(video.saved ? "Video saved! ⭐" : "Video removed from Saved.");
    }

    function toggleFollow(videoId) {
        const video = getVideo(videoId);
        if (!video) return;

        video.following = !video.following;

        // Apply the follow choice to videos from the same creator.
        state.videos.forEach((item) => {
            if (item.username === video.username) {
                item.following = video.following;
            }
        });

        saveState();
        renderFeed();

        showToast(
            video.following
                ? `Following @${video.username}`
                : `Unfollowed @${video.username}`
        );
    }

    /* 10. COMMENTS */

    function openComments(videoId) {
        const video = getVideo(videoId);

        if (!video) return;

        if (!commentsModal) {
            showToast("Add an element with id='commentsModal' to index.html.");
            return;
        }

        const title = $("[data-comments-title]", commentsModal)
            || byId("commentsTitle");

        const list = $("[data-comments-list]", commentsModal)
            || byId("commentsList");

        const input = $("[data-comment-input]", commentsModal)
            || byId("commentInput");

        if (title) {
            title.textContent = `Comments (${video.comments.length})`;
        }

        if (list) {
            if (video.comments.length === 0) {
                list.innerHTML = `
                    <p class="no-comments">
                        No comments yet. Be the first to comment!
                    </p>
                `;
            } else {
                list.innerHTML = video.comments.map((comment) => `
                    <div class="comment-item">
                        <div class="comment-avatar">
                            ${escapeHTML(comment.avatar || "🙂")}
                        </div>

                        <div class="comment-content">
                            <strong>@${escapeHTML(comment.username || "user")}</strong>
                            <p>${escapeHTML(comment.text || "")}</p>
                        </div>
                    </div>
                `).join("");
            }
        }

        if (input) input.value = "";

        commentsModal.dataset.videoId = videoId;
        showModal(commentsModal);

        const form = byId("commentForm")
            || $("form", commentsModal);

        if (form && !form.dataset.vtikBound) {
            form.dataset.vtikBound = "true";

            form.addEventListener("submit", (event) => {
                event.preventDefault();

                const targetId = commentsModal.dataset.videoId;

                const commentInput = $(
                    "textarea, input[name='comment'], input[type='text']",
                    form
                );

                const text = commentInput
                    ? commentInput.value.trim()
                    : "";

                if (!text) return;

                addComment(targetId, text);
                commentInput.value = "";
                openComments(targetId);
            });
        }
    }

    function addComment(videoId, text) {
        const video = getVideo(videoId);

        if (!video || !text.trim()) return;

        video.comments.push({
            id: makeId(),
            username: state.username || currentUser.username,
            avatar: getCurrentAvatar(),
            text: text.trim().slice(0, 1000),
            createdAt: Date.now()
        });

        saveState();
        renderFeed();
        showToast("Comment added 💬");
    }

    /* 11. SHARE */

    async function shareVideo(videoId) {
        const video = getVideo(videoId);

        if (!video) return;

        const shareData = {
            title: `V-Tik video by @${video.username}`,
            text: video.caption || "Watch this video on V-Tik!",
            url: window.location.href.split("#")[0] + `#video-${video.id}`
        };

        try {
            if (navigator.share) {
                await navigator.share(shareData);
            } else if (
                navigator.clipboard &&
                navigator.clipboard.writeText
            ) {
                await navigator.clipboard.writeText(
                    `${shareData.text}\n${shareData.url}`
                );

                showToast("Video link copied!");
            } else {
                window.prompt("Copy this video link:", shareData.url);
            }
        } catch (error) {
            if (error && error.name !== "AbortError") {
                console.warn("V-Tik: share failed.", error);
                showToast("Could not share this video.");
            }
        }
    }

    /* 12. MODALS */

    function showModal(modal) {
        if (!modal) return;

        modal.hidden = false;
        modal.classList.add("open", "active");
        modal.setAttribute("aria-hidden", "false");

        document.body.classList.add("modal-open");
    }

    function hideModal(modal) {
        if (!modal) return;

        modal.classList.remove("open", "active");
        modal.hidden = true;
        modal.setAttribute("aria-hidden", "true");

        const anyOpen = $$(".open, .active").some((element) =>
            element.matches(".modal, [role='dialog']")
        );

        if (!anyOpen) {
            document.body.classList.remove("modal-open");
        }
    }

    function openCreateModal() {
        if (!createModal) {
            const fileInput = byId("videoUpload")
                || byId("videoFile");

            if (fileInput) {
                fileInput.click();
            } else {
                showToast(
                    "Add a create modal or video upload input to index.html."
                );
            }

            return;
        }

        showModal(createModal);
    }

    /* 13. VIDEO UPLOAD */

    function getUploadElements() {
        return {
            input: byId("videoUpload")
                || byId("videoFile")
                || $("input[type='file'][accept*='video']"),

            caption: byId("videoCaption")
                || byId("captionInput")
                || $("textarea[name='caption']"),

            username: byId("creatorName")
                || byId("uploadUsername"),

            submit: byId("publishVideo")
                || byId("uploadSubmit")
                || $("[data-action='publish-video']")
        };
    }

    function bindUploadPreview() {
        const { input } = getUploadElements();

        if (!input || input.dataset.vtikPreviewBound) return;

        input.dataset.vtikPreviewBound = "true";

        $on(input, "change", () => {
            const file = input.files && input.files[0];

            if (!file) return;

            if (!file.type.startsWith("video/")) {
                showToast("Please choose a video file.");
                input.value = "";
                return;
            }

            const preview = byId("uploadPreview")
                || $(".upload-preview");

            if (!preview) return;

            const oldVideo = $("video", preview);

            if (oldVideo && oldVideo.dataset.objectUrl) {
                URL.revokeObjectURL(oldVideo.dataset.objectUrl);
            }

            preview.innerHTML = "";

            const previewVideo = document.createElement("video");
            const objectUrl = URL.createObjectURL(file);

            previewVideo.src = objectUrl;
            previewVideo.dataset.objectUrl = objectUrl;
            previewVideo.controls = true;
            previewVideo.playsInline = true;
            previewVideo.style.width = "100%";
            previewVideo.style.maxHeight = "320px";
            previewVideo.style.objectFit = "contain";

            preview.appendChild(previewVideo);
        });
    }

    async function uploadVideo(file, caption = "", username = "") {
        if (!file || !file.type.startsWith("video/")) {
            showToast("Choose a valid video file first.");
            return;
        }

        if (file.size > 250 * 1024 * 1024) {
            showToast("Please choose a video smaller than 250 MB.");
            return;
        }

        const cleanUsername = safeText(
            username,
            state.username || currentUser.username
        ).replace(/^@/, "").slice(0, 30);

        const video = {
            id: makeId(),
            username: cleanUsername,
            displayName: safeText(username, "V-Tik Creator").slice(0, 60),
            avatar: getCurrentAvatar(),
            caption: caption.trim().slice(0, 2000),
            music: "Original sound",
            src: "",
            uploaded: true,
            likes: 0,
            comments: [],
            liked: false,
            saved: false,
            following: false,
            createdAt: Date.now()
        };

        try {
            await saveVideoFile(video.id, file);
        } catch (error) {
            console.error("V-Tik: upload storage failed.", error);
            showToast("Could not store this video in your browser.");
            return;
        }

        state.videos.unshift(video);
        state.activeTab = "For You";

        searchTerm = "";

        if (searchInput) searchInput.value = "";

        saveState();
        renderFeed();

        if (createModal) hideModal(createModal);

        showToast("Video published successfully! 🎉");
    }

    function bindUploadForm() {
        const { input, caption, username, submit } = getUploadElements();

        bindUploadPreview();

        const form = byId("createForm")
            || byId("uploadForm")
            || (input ? input.closest("form") : null);

        if (form && !form.dataset.vtikUploadBound) {
            form.dataset.vtikUploadBound = "true";

            $on(form, "submit", async (event) => {
                event.preventDefault();

                const file = input && input.files && input.files[0];

                if (!file) {
                    showToast("Choose a video to upload.");
                    return;
                }

                if (submit) {
                    submit.disabled = true;
                    submit.textContent = "Publishing...";
                }

                try {
                    await uploadVideo(
                        file,
                        caption ? caption.value : "",
                        username ? username.value : ""
                    );

                    form.reset();

                    const preview = byId("uploadPreview")
                        || $(".upload-preview");

                    if (preview) {
                        const previewVideo = $("video", preview);

                        if (previewVideo && previewVideo.dataset.objectUrl) {
                            URL.revokeObjectURL(
                                previewVideo.dataset.objectUrl
                            );
                        }

                        preview.innerHTML = "";
                    }
                } finally {
                    if (submit) {
                        submit.disabled = false;
                        submit.textContent = "Publish";
                    }
                }
            });
        }

        if (submit && !form && !submit.dataset.vtikUploadBound) {
            submit.dataset.vtikUploadBound = "true";

            $on(submit, "click", async () => {
                const file = input && input.files && input.files[0];

                await uploadVideo(
                    file,
                    caption ? caption.value : "",
                    username ? username.value : ""
                );
            });
        }
    }

    /* Continue with Part 3 below this line. */

    /* 14. FULLSCREEN VIDEO VIEWER */

    async function openViewer(videoId) {
        const video = getVideo(videoId);
        if (!video) return;

        activeVideoId = videoId;

        if (!viewer) {
            const element = $(
                `.feed-video[data-video-id="${CSS.escape(videoId)}"]`,
                feed
            );

            if (element && element.requestFullscreen) {
                try {
                    await element.requestFullscreen();
                } catch (error) {
                    console.warn("V-Tik: fullscreen unavailable.", error);
                    showToast("Could not open fullscreen.");
                }
            } else {
                showToast("Add a fullscreen viewer to index.html.");
            }

            return;
        }

        const viewerVideo = $("video", viewer) || byId("viewerVideo");

        const caption = $("[data-viewer-caption]", viewer)
            || byId("viewerCaption");

        const username = $("[data-viewer-username]", viewer)
            || byId("viewerUsername");

        if (caption) caption.textContent = video.caption || "";

        if (username) username.textContent = `@${video.username}`;

        if (viewerVideo) {
            viewerVideo.pause();

            const source = await resolveVideoSource(video);

            viewerVideo.muted = false;
            viewerVideo.loop = true;
            viewerVideo.playsInline = true;

            if (source) {
                viewerVideo.src = source;

                if (source.startsWith("blob:")) {
                    if (currentObjectUrl) {
                        URL.revokeObjectURL(currentObjectUrl);
                    }

                    currentObjectUrl = source;
                }

                viewerVideo.load();

                const playPromise = viewerVideo.play();

                if (playPromise && playPromise.catch) {
                    playPromise.catch(() => {
                        showToast("Tap the video to start playback.");
                    });
                }
            } else {
                viewerVideo.removeAttribute("src");
                viewerVideo.load();
                showToast("This video file could not be found.");
            }
        }

        viewer.dataset.videoId = videoId;
        showModal(viewer);
    }

    function closeViewer() {
        if (!viewer) return;

        const video = $("video", viewer) || byId("viewerVideo");

        if (video) {
            video.pause();
            video.removeAttribute("src");
            video.load();
        }

        if (currentObjectUrl) {
            URL.revokeObjectURL(currentObjectUrl);
            currentObjectUrl = null;
        }

        hideModal(viewer);
        activeVideoId = null;
    }

    /* 15. NAVIGATION AND TABS */

    function setActiveTab(tabName) {
        const allowedTabs = [
            "For You",
            "Following",
            "Saved",
            "Explore"
        ];

        state.activeTab = allowedTabs.includes(tabName)
            ? tabName
            : "For You";

        $$(".nav-link, .sidebar-link, .mobile-nav button, [data-tab]")
            .forEach((element) => {
                const label = safeText(
                    element.dataset.tab
                    || element.dataset.label
                    || element.textContent,
                    ""
                );

                const active = label.trim().toLowerCase()
                    === state.activeTab.toLowerCase();

                element.classList.toggle("active", active);

                if (active) {
                    element.setAttribute("aria-current", "page");
                } else {
                    element.removeAttribute("aria-current");
                }
            });

        saveState();
        renderFeed();
    }

    function bindNavigation() {
        $$("[data-tab], .nav-link, .sidebar-link, .mobile-nav button")
            .forEach((element) => {
                if (element.dataset.vtikNavBound) return;

                element.dataset.vtikNavBound = "true";

                $on(element, "click", (event) => {
                    const tab = safeText(
                        element.dataset.tab
                        || element.dataset.label
                        || element.textContent,
                        ""
                    ).trim();

                    const normalized = tab.toLowerCase();

                    const tabMap = {
                        "for you": "For You",
                        "following": "Following",
                        "saved": "Saved",
                        "explore": "Explore"
                    };

                    if (tabMap[normalized]) {
                        event.preventDefault();
                        setActiveTab(tabMap[normalized]);
                    }
                });
            });
    }

    /* 16. SEARCH */

    function bindSearch() {
        if (!searchInput || searchInput.dataset.vtikSearchBound) return;

        searchInput.dataset.vtikSearchBound = "true";

        $on(searchInput, "input", () => {
            searchTerm = searchInput.value.trim();
            renderFeed();
        });

        $on(searchInput, "keydown", (event) => {
            if (event.key === "Escape") {
                searchInput.value = "";
                searchTerm = "";
                renderFeed();
                searchInput.blur();
            }
        });
    }

    /* 17. CLICK ACTIONS */

    function bindFeedActions() {
        if (!feed || feed.dataset.vtikActionsBound) return;

        feed.dataset.vtikActionsBound = "true";

        $on(feed, "click", async (event) => {
            const button = event.target.closest("[data-action]");

            if (!button || !feed.contains(button)) return;

            const action = button.dataset.action;
            const videoId = button.dataset.videoId
                || button.closest("[data-video-id]")?.dataset.videoId;

            switch (action) {
                case "like":
                    toggleLike(videoId);
                    break;

                case "save":
                    toggleSave(videoId);
                    break;

                case "follow":
                    toggleFollow(videoId);
                    break;

                case "comment":
                    openComments(videoId);
                    break;

                case "share":
                    await shareVideo(videoId);
                    break;

                case "expand":
                    await openViewer(videoId);
                    break;

                case "sound": {
                    const card = button.closest(".video-card");
                    const video = $(".feed-video", card);

                    if (!video) return;

                    video.muted = !video.muted;
                    button.textContent = video.muted ? "🔇" : "🔊";

                    if (!video.muted) {
                        const playPromise = video.play();

                        if (playPromise && playPromise.catch) {
                            playPromise.catch(() => {});
                        }
                    }

                    break;
                }

                case "open-create":
                    openCreateModal();
                    break;

                case "close-modal":
                    hideModal(button.closest(".modal, [role='dialog']"));
                    break;

                case "close-viewer":
                    closeViewer();
                    break;

                default:
                    break;
            }
        });
    }

    /* 18. MODAL CONTROLS */

    function bindModalControls() {
        $$("[data-open-create], #createButton, #uploadButton, .create-button")
            .forEach((button) => {
                if (button.dataset.vtikCreateBound) return;

                button.dataset.vtikCreateBound = "true";

                $on(button, "click", (event) => {
                    event.preventDefault();
                    openCreateModal();
                });
            });

        $$("[data-close-modal], .modal-close, .close-modal")
            .forEach((button) => {
                if (button.dataset.vtikCloseBound) return;

                button.dataset.vtikCloseBound = "true";

                $on(button, "click", () => {
                    const modal = button.closest(".modal, [role='dialog']");

                    if (modal) hideModal(modal);
                });
            });

        [createModal, commentsModal, viewer].forEach((modal) => {
            if (!modal || modal.dataset.vtikBackdropBound) return;

            modal.dataset.vtikBackdropBound = "true";

            $on(modal, "click", (event) => {
                if (event.target !== modal) return;

                if (modal === viewer) {
                    closeViewer();
                } else {
                    hideModal(modal);
                }
            });
        });

        $on(document, "keydown", (event) => {
            if (event.key === "Escape") {
                if (viewer && !viewer.hidden) {
                    closeViewer();
                } else {
                    [createModal, commentsModal].forEach((modal) => {
                        if (modal && !modal.hidden) hideModal(modal);
                    });
                }
            }
        });
    }

    /* 19. PROFILE BUTTON EVENTS */

    function bindProfileButtons() {
        [profileButton, mobileProfile].forEach((button) => {
            if (!button || button.dataset.vtikProfileBound) return;

            button.dataset.vtikProfileBound = "true";

            $on(button, "click", (event) => {
                event.preventDefault();
                openProfile();
            });
        });
    }

    /* 20. VIDEO ERROR HANDLING */

    function bindVideoErrors() {
        if (!feed || feed.dataset.vtikErrorsBound) return;

        feed.dataset.vtikErrorsBound = "true";

        $on(feed, "error", (event) => {
            const video = event.target;

            if (!(video instanceof HTMLVideoElement)) return;

            video.classList.add("video-source-error");

            const stage = video.closest(".video-stage");

            if (stage) {
                let message = $(".video-unavailable-message", stage);

                if (!message) {
                    message = document.createElement("div");
                    message.className = "video-unavailable-message";
                    stage.appendChild(message);
                }

                message.textContent =
                    "Video could not load. Check the video file path.";
            }
        }, true);
    }

    /* 21. INITIALIZE APP */

    function initializeVtik() {
        bindNavigation();
        bindSearch();
        bindFeedActions();
        bindModalControls();
        bindProfileButtons();
        bindUploadForm();
        bindVideoErrors();

        updateProfileButton();

        setActiveTab(
            state.activeTab || "For You"
        );

        console.info("V-Tik initialized successfully.");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeVtik, {
            once: true
        });
    } else {
        initializeVtik();
    }

})();
