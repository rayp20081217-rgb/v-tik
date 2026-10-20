
"use strict";

/* =========================================================
   V-TIK — COMPLETE FRONT-END APP
   Feed • Videos • Likes • Saves • Comments • Follows
   Search • Uploads • Fullscreen viewer • Mobile navigation
========================================================= */

(() => {
    /* -----------------------------------------------------
       1. SAFE DOM HELPERS
    ----------------------------------------------------- */

    const $ = (selector, parent = document) => {
        if (!parent || typeof parent.querySelector !== "function") {
            return null;
        }

        return parent.querySelector(selector);
    };

    const $$ = (selector, parent = document) => {
        if (!parent || typeof parent.querySelectorAll !== "function") {
            return [];
        }

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

        if (value >= 1_000_000) {
            return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
        }

        if (value >= 1_000) {
            return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
        }

        return String(value);
    };

    const safeText = (value, fallback = "") =>
        typeof value === "string" && value.trim()
            ? value.trim()
            : fallback;

    const $on = (element, event, callback, options) => {
        if (element && typeof element.addEventListener === "function") {
            element.addEventListener(event, callback, options);
        }
    };

    /* -----------------------------------------------------
       2. APP ELEMENTS

       Missing optional elements won't crash the app.
    ----------------------------------------------------- */

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

    /* -----------------------------------------------------
       3. STORAGE
    ----------------------------------------------------- */

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
            comments: [
                {
                    id: makeId(),
                    username: "happyviewer",
                    avatar: "😊",
                    text: "Welcome to V-Tik! 🔥",
                    createdAt: Date.now()
                }
            ],
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
            src: "videos/vtik-demo-2.mp4",
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
            src: "videos/vtik-demo-3.mp4",
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
            // Video files themselves are stored separately in IndexedDB.
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

    /* -----------------------------------------------------
       4. VIDEO FILE DATABASE

       Uploaded videos can remain on this device after reload.
    ----------------------------------------------------- */

    function openVideoDB() {
        if (!("indexedDB" in window)) {
            return Promise.reject(
                new Error("IndexedDB is not supported in this browser.")
            );
        }

        if (dbPromise) return dbPromise;

        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(VIDEO_DB_NAME, 1);

            request.onupgradeneeded = () => {
                const db = request.result;

                if (!db.objectStoreNames.contains(VIDEO_STORE_NAME)) {
                    db.createObjectStore(VIDEO_STORE_NAME, {
                        keyPath: "id"
                    });
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
            const transaction = db.transaction(
                VIDEO_STORE_NAME,
                "readwrite"
            );

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
            const transaction = db.transaction(
                VIDEO_STORE_NAME,
                "readonly"
            );

            const request = transaction
                .objectStore(VIDEO_STORE_NAME)
                .get(id);

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
                const transaction = db.transaction(
                    VIDEO_STORE_NAME,
                    "readwrite"
                );

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

                if (file) {
                    return URL.createObjectURL(file);
                }
            } catch (error) {
                console.warn("V-Tik: uploaded video unavailable.", error);
            }

            return "";
        }

        return video.src || "";
    }

    /* -----------------------------------------------------
       5. TOAST NOTIFICATIONS
    ----------------------------------------------------- */

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

    /* -----------------------------------------------------
       6. VIDEO CARD HTML
    ----------------------------------------------------- */

    function videoCardHTML(video) {
        const username = safeText(video.username, "creator");
        const displayName = safeText(video.displayName, username);
        const avatar = safeText(video.avatar, "🙂");
        const caption = safeText(video.caption, "");
        const music = safeText(video.music, "Original sound");

        return `
            <article class="video-card"
                     data-video-id="${escapeHTML(video.id)}">

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

    /* -----------------------------------------------------
       7. FEED FILTERING AND RENDERING
    ----------------------------------------------------- */

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

        return videos.sort(
            (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
        );
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
            console.error(
                'V-Tik: Could not find the feed element. Add <main id="feed" class="feed"></main> to index.html.'
            );
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

        feed.innerHTML = videos.map(videoCardHTML).join("");

        updateProfileButton();
        loadFeedVideoSources();
        setupVideoPlayback();
    }

    async function loadFeedVideoSources() {
        const videoElements = $$(".feed-video", feed);

        for (const element of videoElements) {
            const videoId = element.dataset.videoId;
            const video = getVideo(videoId);

            if (!video) continue;

            const source = await resolveVideoSource(video);

            // The card may have been removed while the file was loading.
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
            element.load();

            if (source.startsWith("blob:")) {
                element.dataset.objectUrl = source;
            }
        }
    }

    function setupVideoPlayback() {
        const videos = $$(".feed-video", feed);

        if (!("IntersectionObserver" in window)) {
            videos.forEach((video) => {
                video.muted = true;
            });
            return;
        }

        if (window.vtikVideoObserver) {
            window.vtikVideoObserver.disconnect();
        }

        window.vtikVideoObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    const video = entry.target;

                    if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
                        videos.forEach((otherVideo) => {
                            if (otherVideo !== video) otherVideo.pause();
                        });

                        const playPromise = video.play();

                        if (playPromise && typeof playPromise.catch === "function") {
                            playPromise.catch(() => {
                                // Autoplay may be blocked until the user presses play.
                            });
                        }
                    } else {
                        video.pause();
                    }
                });
            },
            { threshold: [0, 0.6, 1] }
        );

        videos.forEach((video) => {
            video.muted = true;
            window.vtikVideoObserver.observe(video);
        });
    }

    /* -----------------------------------------------------
       8. PROFILE AVATAR — NULL-SAFE
    ----------------------------------------------------- */

    function updateProfileButton() {
        const avatar = getCurrentAvatar();

        if (profileButton) {
            profileButton.innerHTML = `
                <span class="avatar small">${escapeHTML(avatar)}</span>
            `;
        }

        if (mobileProfile) {
            const mobileAvatar = $(".avatar", mobileProfile);

            if (mobileAvatar) {
                mobileAvatar.textContent = avatar;
            } else {
                mobileProfile.textContent = avatar;
            }
        }
    }

    /* -----------------------------------------------------
       9. LIKES, SAVES AND FOLLOWING
    ----------------------------------------------------- */

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
    }

    function toggleSave(videoId) {
        const video = getVideo(videoId);
        if (!video) return;

        video.saved = !video.saved;

        saveState();
        renderFeed();

        showToast(video.saved ? "Video saved ⭐" : "Removed from saved videos");
    }

    function toggleFollow(videoId) {
        const video = getVideo(videoId);
        if (!video) return;

        video.following = !video.following;

        saveState();
        renderFeed();

        showToast(video.following
            ? `Following @${video.username}`
            : `Unfollowed @${video.username}`);
    }

    /* -----------------------------------------------------
       10. COMMENTS
    ----------------------------------------------------- */

    function openComments(videoId) {
        const video = getVideo(videoId);
        if (!video) return;

        activeVideoId = videoId;

        if (!commentsModal) {
            const commentText = window.prompt(
                `Add a comment to @${video.username}'s video:`
            );

            if (commentText && commentText.trim()) {
                addComment(videoId, commentText.trim());
            }

            return;
        }

        const title = $("[data-comments-title]", commentsModal)
            || byId("commentsTitle");

        const list = $("[data-comments-list]", commentsModal)
            || byId("commentsList")
            || $(".comments-list", commentsModal);

        const form = $("form", commentsModal);
        const input = $("textarea, input[name='comment'], input[type='text']", commentsModal);

        if (title) {
            title.textContent = `Comments · @${video.username}`;
        }

        if (list) {
            if (!video.comments.length) {
                list.innerHTML = `
                    <div class="no-comments">
                        Be the first to comment 💬
                    </div>
                `;
            } else {
                list.innerHTML = video.comments.map((comment) => `
                    <div class="comment-item">
                        <div class="avatar small">${escapeHTML(comment.avatar || "🙂")}</div>
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

        if (form && !form.dataset.vtikBound) {
            form.dataset.vtikBound = "true";

            form.addEventListener("submit", (event) => {
                event.preventDefault();

                const targetId = commentsModal.dataset.videoId;
                const commentInput = $("textarea, input[name='comment'], input[type='text']", form);
                const text = commentInput ? commentInput.value.trim() : "";

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
            text: text.trim(),
            createdAt: Date.now()
        });

        saveState();
        renderFeed();
        showToast("Comment added 💬");
    }

    /* -----------------------------------------------------
       11. SHARE
    ----------------------------------------------------- */

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
            } else if (navigator.clipboard && navigator.clipboard.writeText) {
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

    /* -----------------------------------------------------
       12. MODALS
    ----------------------------------------------------- */

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
            const fileInput = byId("videoUpload") || byId("videoFile");

            if (fileInput) {
                fileInput.click();
            } else {
                showToast("Add a create modal or video upload input to index.html.");
            }

            return;
        }

        showModal(createModal);
    }

    /* -----------------------------------------------------
       13. VIDEO UPLOAD
    ----------------------------------------------------- */

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

            const preview = byId("uploadPreview") || $(".upload-preview");
            if (!preview) return;

            const url = URL.createObjectURL(file);

            preview.innerHTML = `
                <video src="${url}" controls playsinline
                       style="width:100%;max-height:320px;object-fit:contain;">
                </video>
            `;
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

        const video = {
            id: makeId(),
            username: safeText(username, state.username || currentUser.username)
                .replace(/^@/, ""),
            displayName: safeText(username, "V-Tik Creator"),
            avatar: getCurrentAvatar(),
            caption: caption.trim(),
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

                    const preview = byId("uploadPreview") || $(".upload-preview");
                    if (preview) preview.innerHTML = "";
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

    /* -----------------------------------------------------
       14. FULLSCREEN VIDEO VIEWER
    ----------------------------------------------------- */

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
                }
            } else {
                showToast("Fullscreen viewer is not set up in index.html.");
            }

            return;
        }

        const viewerVideo = $("video", viewer)
            || byId("viewerVideo");

        const caption = $("[data-viewer-caption]", viewer)
            || byId("viewerCaption");

        const username = $("[data-viewer-username]", viewer)
            || byId("viewerUsername");

        if (caption) caption.textContent = video.caption || "";
        if (username) username.textContent = `@${video.username}`;

        if (viewerVideo) {
            viewerVideo.pause();

            const source = await resolveVideoSource(video);
            viewerVideo.src = source;
            viewerVideo.loop = true;
            viewerVideo.playsInline = true;
            viewerVideo.muted = false;
            viewerVideo.load();

            const playPromise = viewerVideo.play();

            if (playPromise && playPromise.catch) {
                playPromise.catch(() => {});
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

        hideModal(viewer);
        activeVideoId = null;
    }

    /* -----------------------------------------------------
       15. NAVIGATION AND TABS
    ----------------------------------------------------- */

    function setActiveTab(tabName) {
        const allowedTabs = ["For You", "Following", "Saved", "Explore"];

        state.activeTab = allowedTabs.includes(tabName)
            ? tabName
            : "For You";

        $$(".nav-link, .sidebar-link, .mobile-nav button, [data-tab]")
            .forEach((element) => {
                const label = safeText(
                    element.dataset.tab
                        || element.dataset.nav
                        || element.textContent,
                    ""
                );

                element.classList.toggle(
                    "active",
                    label.trim().toLowerCase() === state.activeTab.toLowerCase()
                );
            });

        saveState();
        renderFeed();
    }

    function bindNavigation() {
        $$("[data-tab], [data-nav], .nav-link, .sidebar-link, .mobile-nav button")
            .forEach((element) => {
                if (element.dataset.vtikNavBound) return;

                element.dataset.vtikNavBound = "true";

                $on(element, "click", () => {
                    const label = safeText(
                        element.dataset.tab || element.dataset.nav || element.textContent,
                        ""
                    ).trim().toLowerCase();

                    if (label.includes("following")) {
                        setActiveTab("Following");
                    } else if (label.includes("saved") || label.includes("bookmark")) {
                        setActiveTab("Saved");
                    } else if (label.includes("explore") || label.includes("discover")) {
                        setActiveTab("Explore");
                    } else if (
                        label.includes("for you")
                        || label.includes("home")
                        || label.includes("feed")
                    ) {
                        setActiveTab("For You");
                    } else if (label.includes("create") || label.includes("upload")) {
                        openCreateModal();
                    } else if (label.includes("profile")) {
                        showToast(`Your profile: @${state.username}`);
                    }
                });
            });
    }

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

    /* -----------------------------------------------------
       16. CLICK HANDLING
    ----------------------------------------------------- */

    function bindGlobalClicks() {
        $on(document, "click", async (event) => {
            const target = event.target;
            if (!(target instanceof Element)) return;

            const actionElement = target.closest("[data-action]");
            if (!actionElement) return;

            const action = actionElement.dataset.action;
            const videoId = actionElement.dataset.videoId
                || actionElement.closest("[data-video-id]")?.dataset.videoId;

            switch (action) {
                case "like":
                    event.preventDefault();
                    toggleLike(videoId);
                    break;

                case "save":
                    event.preventDefault();
                    toggleSave(videoId);
                    break;

                case "follow":
                    event.preventDefault();
                    toggleFollow(videoId);
                    break;

                case "comment":
                    event.preventDefault();
                    openComments(videoId);
                    break;

                case "share":
                    event.preventDefault();
                    await shareVideo(videoId);
                    break;

                case "expand":
                case "fullscreen":
                    event.preventDefault();
                    await openViewer(videoId);
                    break;

                case "sound": {
                    const card = actionElement.closest(".video-card");
                    const video = $("video", card);

                    if (video) {
                        video.muted = !video.muted;
                        actionElement.textContent = video.muted ? "🔇" : "🔊";
                    }
                    break;
                }

                case "open-create":
                case "create":
                case "upload":
                    event.preventDefault();
                    openCreateModal();
                    break;

                case "close-modal":
                case "close-create":
                    event.preventDefault();
                    hideModal(actionElement.closest(".modal") || createModal);
                    break;

                case "close-comments":
                    event.preventDefault();
                    hideModal(commentsModal);
                    break;

                case "close-viewer":
                    event.preventDefault();
                    closeViewer();
                    break;

                case "profile":
                    event.preventDefault();
                    showToast(`Signed in locally as @${state.username}`);
                    break;

                case "clear-search":
                    if (searchInput) {
                        searchInput.value = "";
                        searchTerm = "";
                        renderFeed();
                    }
                    break;
            }
        });

        // Clicking a modal backdrop closes it.
        [createModal, commentsModal, viewer].filter(Boolean).forEach((modal) => {
            $on(modal, "click", (event) => {
                if (event.target === modal) {
                    if (modal === viewer) {
                        closeViewer();
                    } else {
                        hideModal(modal);
                    }
                }
            });
        });

        $on(document, "keydown", (event) => {
            if (event.key === "Escape") {
                if (viewer && !viewer.hidden) closeViewer();

                [createModal, commentsModal].filter(Boolean).forEach((modal) => {
                    if (!modal.hidden) hideModal(modal);
                });
            }
        });
    }

    /* -----------------------------------------------------
       17. PROFILE EDITING
    ----------------------------------------------------- */

    function bindProfileEditing() {
        const usernameInput = byId("profileUsername");
        const avatarInput = byId("profileAvatar");
        const saveProfile = byId("saveProfile");

        if (!saveProfile || saveProfile.dataset.vtikProfileBound) return;

        saveProfile.dataset.vtikProfileBound = "true";

        $on(saveProfile, "click", () => {
            if (usernameInput && usernameInput.value.trim()) {
                state.username = usernameInput.value.trim().replace(/^@/, "");
            }

            if (avatarInput && avatarInput.value.trim()) {
                state.avatar = avatarInput.value.trim();
            }

            saveState();
            updateProfileButton();
            showToast("Profile updated!");
        });
    }

    /* -----------------------------------------------------
       18. BASIC ACCESSIBILITY AND ERROR HANDLING
    ----------------------------------------------------- */

    function bindVideoErrors() {
        $on(feed, "error", (event) => {
            const video = event.target;

            if (!(video instanceof HTMLVideoElement)) return;

            const stage = video.closest(".video-stage");
            if (!stage) return;

            stage.classList.add("video-unavailable");

            let notice = $(".video-unavailable-message", stage);

            if (!notice) {
                notice = document.createElement("div");
                notice.className = "video-unavailable-message";
                stage.appendChild(notice);
            }

            notice.textContent = "Unable to play this video. Check the video file path.";
        }, true);
    }

    function cleanupObjectURLs() {
        $$(".feed-video[data-object-url]", feed).forEach((video) => {
            const url = video.dataset.objectUrl;

            if (url) {
                try {
                    URL.revokeObjectURL(url);
                } catch (_) {
                    // Ignore invalid or already-revoked URLs.
                }
            }
        });

        if (currentObjectUrl) {
            URL.revokeObjectURL(currentObjectUrl);
            currentObjectUrl = null;
        }
    }

    /* -----------------------------------------------------
       19. INITIALIZE
    ----------------------------------------------------- */

    function initializeApp() {
        updateProfileButton();
        bindNavigation();
        bindSearch();
        bindGlobalClicks();
        bindUploadForm();
        bindProfileEditing();
        bindVideoErrors();

        // Ensure optional modals start hidden when present.
        [createModal, commentsModal, viewer].filter(Boolean).forEach((modal) => {
            if (!modal.hasAttribute("data-start-open")) {
                modal.hidden = true;
                modal.setAttribute("aria-hidden", "true");
            }
        });

        renderFeed();

        console.info(
            `V-Tik initialized successfully. Videos in feed: ${state.videos.length}`
        );
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeApp, { once: true });
    } else {
        initializeApp();
    }

    window.addEventListener("beforeunload", cleanupObjectURLs);

    /* -----------------------------------------------------
       20. OPTIONAL PUBLIC FUNCTIONS
    ----------------------------------------------------- */

    window.VTik = {
        renderFeed,
        uploadVideo,
        openComments,
        openViewer,
        closeViewer,
        setActiveTab,
        showToast,
        get videos() {
            return [...state.videos];
        }
    };
})();
