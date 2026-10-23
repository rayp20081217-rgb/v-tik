```javascript
"use strict";

/* =========================================================
   V-TIK — COMPLETE APP.JS
   Feed • Uploads • Likes • Comments • Saves • Follows
   Search • Navigation • Sharing • Fullscreen • Mobile
========================================================= */

(() => {
    /* 1. SAFE HELPERS */

    const $ = (selector, parent = document) =>
        parent ? parent.querySelector(selector) : null;

    const $$ = (selector, parent = document) =>
        parent ? Array.from(parent.querySelectorAll(selector)) : [];

    const byId = (id) => document.getElementById(id);

    const makeId = () =>
        `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const safeText = (value, fallback = "") =>
        typeof value === "string" && value.trim()
            ? value.trim()
            : fallback;

    const escapeHTML = (value = "") =>
        String(value).replace(/[&<>"']/g, (character) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]);

    const formatCount = (value = 0) => {
        const number = Number(value) || 0;

        if (number >= 1_000_000) {
            return `${(number / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
        }

        if (number >= 1_000) {
            return `${(number / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
        }

        return String(number);
    };

    /* 2. HTML ELEMENTS */

    const feed = byId("feed") || $(".feed");
    const searchInput = byId("searchInput") ||
        $(".search input") ||
        byId("search");

    const createModal = byId("createModal") || byId("uploadModal");
    const commentsModal = byId("commentsModal");
    const viewer = byId("videoViewer") || byId("fullscreenViewer");

    const videoPicker = byId("videoPicker") ||
        byId("videoUpload") ||
        byId("videoFile");

    const uploadZone = byId("uploadZone");
    const previewContainer = byId("previewContainer");
    const uploadPreview = byId("uploadPreview");
    const uploadName = byId("uploadName");
    const videoCaption = byId("videoCaption");
    const postVideo = byId("postVideo");

    const currentUser = {
        username: "you",
        displayName: "V-Tik User",
        avatar: "😎"
    };

    /* 3. STATE AND STORAGE */

    const STORAGE_KEY = "vtik_app_state_v1";
    const VIDEO_DB_NAME = "vtik_video_storage";
    const VIDEO_STORE_NAME = "videos";

    function loadState() {
        const cleanState = {
            videos: [],
            activeTab: "For You",
            currentSection: "home",
            username: currentUser.username,
            avatar: currentUser.avatar
        };

        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return cleanState;

            const saved = JSON.parse(raw);

            // Remove the old sample videos from previous app versions.
            const videos = Array.isArray(saved.videos)
                ? saved.videos.filter((video) =>
                    video &&
                    !/^demo-\d+$/i.test(String(video.id || "")) &&
                    !/^vtik-demo-/i.test(String(video.src || ""))
                )
                : [];

            return {
                videos: videos.map((video) => ({
                    likes: 0,
                    liked: false,
                    saved: false,
                    following: false,
                    music: "Original sound",
                    comments: [],
                    ...video,
                    comments: Array.isArray(video.comments)
                        ? video.comments
                        : []
                })),
                activeTab: saved.activeTab || "For You",
                currentSection: saved.currentSection || "home",
                username: saved.username || currentUser.username,
                avatar: saved.avatar || currentUser.avatar
            };
        } catch (error) {
            console.warn("V-Tik: saved state could not be read.", error);
            return cleanState;
        }
    }

    const state = loadState();

    let activeVideoId = null;
    let searchTerm = "";
    let dbPromise = null;
    let toastTimer = null;
    let previewObjectUrl = null;
    let viewerObjectUrl = null;

    function saveState() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (error) {
            console.error("V-Tik: could not save app state.", error);
            showToast("Could not save changes in this browser.");
        }
    }

    function getVideo(id) {
        return state.videos.find((video) => video.id === id);
    }

    function getAvatar() {
        return safeText(state.avatar, currentUser.avatar);
    }

    /* 4. VIDEO FILE STORAGE */

    function openVideoDB() {
        if (!("indexedDB" in window)) {
            return Promise.reject(
                new Error("This browser does not support IndexedDB.")
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

            request.onsuccess = () => {
                const db = request.result;
                db.onversionchange = () => db.close();
                resolve(db);
            };

            request.onerror = () => {
                dbPromise = null;
                reject(request.error);
            };
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
            transaction.onabort = () => reject(transaction.error);
        });
    }

    async function getVideoFile(id) {
        const db = await openVideoDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(VIDEO_STORE_NAME, "readonly");
            const request = transaction.objectStore(VIDEO_STORE_NAME).get(id);

            request.onsuccess = () =>
                resolve(request.result ? request.result.file : null);

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
            console.warn("V-Tik: could not delete stored video.", error);
        }
    }

    async function resolveVideoSource(video) {
        if (!video) return "";

        if (video.uploaded) {
            try {
                const file = await getVideoFile(video.id);
                return file ? URL.createObjectURL(file) : "";
            } catch (error) {
                console.warn("V-Tik: video file could not be loaded.", error);
                return "";
            }
        }

        return video.src || "";
    }

    /* 5. TOAST MESSAGE */

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
        }, 2800);
    }

    /* 6. VIDEO CARD */

    function videoCardHTML(video) {
        const username = safeText(video.username, "creator");
        const displayName = safeText(video.displayName, username);
        const avatar = safeText(video.avatar, "🙂");
        const caption = safeText(video.caption, "");
        const music = safeText(video.music, "Original sound");
        const id = escapeHTML(video.id);

        return `
            <article class="video-card" data-video-id="${id}">
                <div class="video-user">
                    <div class="avatar">${escapeHTML(avatar)}</div>

                    <div class="video-user-info">
                        <strong>@${escapeHTML(username)}</strong>
                        <span>${escapeHTML(displayName)}</span>
                    </div>

                    <button
                        class="follow-btn ${video.following ? "following" : ""}"
                        type="button"
                        data-action="follow"
                        data-video-id="${id}">
                        ${video.following ? "Following" : "Follow"}
                    </button>
                </div>

                <div class="video-stage">
                    <video
                        class="feed-video"
                        data-video-id="${id}"
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

                    <button
                        class="sound-toggle"
                        type="button"
                        data-action="sound"
                        data-video-id="${id}"
                        aria-label="Toggle sound">
                        🔇
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
                        <button
                            class="action-btn ${video.liked ? "active liked" : ""}"
                            type="button"
                            data-action="like"
                            data-video-id="${id}"
                            aria-label="Like video">
                            <span class="action-icon">${video.liked ? "♥" : "♡"}</span>
                            <span>${formatCount(video.likes)}</span>
                        </button>

                        <button
                            class="action-btn"
                            type="button"
                            data-action="comment"
                            data-video-id="${id}"
                            aria-label="Comments">
                            <span class="action-icon">▢</span>
                            <span>${formatCount(video.comments.length)}</span>
                        </button>

                        <button
                            class="action-btn ${video.saved ? "active saved" : ""}"
                            type="button"
                            data-action="save"
                            data-video-id="${id}"
                            aria-label="Save video">
                            <span class="action-icon">${video.saved ? "★" : "☆"}</span>
                            <span>${video.saved ? "Saved" : "Save"}</span>
                        </button>

                        <button
                            class="action-btn"
                            type="button"
                            data-action="share"
                            data-video-id="${id}"
                            aria-label="Share video">
                            <span class="action-icon">↗</span>
                            <span>Share</span>
                        </button>

                        <button
                            class="action-btn"
                            type="button"
                            data-action="expand"
                            data-video-id="${id}"
                            aria-label="Open fullscreen">
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
        }

        if (state.activeTab === "Saved") {
            videos = videos.filter((video) => video.saved);
        }

        if (state.activeTab === "Liked") {
            videos = videos.filter((video) => video.liked);
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

        if (state.activeTab === "Trending") {
            videos.sort((a, b) => (b.likes || 0) - (a.likes || 0));
        } else {
            videos.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        }

        return videos;
    }

    function renderEmptyFeed() {
        if (!feed) return;

        // Intentionally leave the feed blank: no automatic create-video prompt.
        feed.replaceChildren();
    }

    function revokeFeedObjectUrls() {
        $$(".feed-video[data-object-url]", feed).forEach((video) => {
            try {
                URL.revokeObjectURL(video.dataset.objectUrl);
            } catch (_) {}

            delete video.dataset.objectUrl;
        });
    }

    function renderFeed() {
        if (!feed) {
            console.error('V-Tik: missing <main id="feed"> in index.html.');
            return;
        }

        const videos = getVisibleVideos();

        if (videos.length === 0) {
            if (window.vtikVideoObserver) {
                window.vtikVideoObserver.disconnect();
            }

            revokeFeedObjectUrls();
            renderEmptyFeed();
            updateProfileButton();
            return;
        }

        revokeFeedObjectUrls();

        feed.innerHTML = videos.map(videoCardHTML).join("");

        updateProfileButton();
        setupVideoPlayback();
        loadFeedVideoSources();
    }

    async function loadFeedVideoSources() {
        const elements = $$(".feed-video", feed);

        for (const element of elements) {
            const video = getVideo(element.dataset.videoId);
            if (!video) continue;

            let source = "";

            try {
                source = await resolveVideoSource(video);
            } catch (error) {
                console.warn("V-Tik: source could not be loaded.", error);
            }

            if (!element.isConnected) {
                if (source.startsWith("blob:")) URL.revokeObjectURL(source);
                continue;
            }

            if (!source) {
                const stage = element.closest(".video-stage");
                element.removeAttribute("src");
                element.load();

                if (stage) {
                    stage.classList.add("video-unavailable");

                    let notice = $(".video-unavailable-message", stage);

                    if (!notice) {
                        notice = document.createElement("div");
                        notice.className = "video-unavailable-message";
                        notice.textContent = "Video file is unavailable";
                        stage.appendChild(notice);
                    }
                }

                continue;
            }

            element.src = source;
            element.dataset.loaded = "true";

            if (source.startsWith("blob:")) {
                element.dataset.objectUrl = source;
            }

            element.load();
        }
    }

    function setupVideoPlayback() {
        const videos = $$(".feed-video", feed);

        if (window.vtikVideoObserver) {
            window.vtikVideoObserver.disconnect();
        }

        if (!("IntersectionObserver" in window)) {
            videos.forEach((video) => {
                video.muted = true;
            });
            return;
        }

        window.vtikVideoObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                const video = entry.target;

                if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
                    videos.forEach((other) => {
                        if (other !== video) other.pause();
                    });

                    const result = video.play();
                    if (result && result.catch) result.catch(() => {});
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

    /* 8. PROFILE */

    function updateProfileButton() {
        const avatar = getAvatar();
        const profileButton = byId("profileButton") || $(".profile-button");
        const mobileProfile = byId("mobileProfile");

        if (profileButton) {
            const avatarElement = $(".avatar", profileButton);

            if (avatarElement) {
                avatarElement.textContent = avatar;
            } else {
                profileButton.textContent = avatar;
            }
        }

        if (mobileProfile) {
            const avatarElement = $(".avatar", mobileProfile);
            if (avatarElement) avatarElement.textContent = avatar;
            else mobileProfile.textContent = avatar;
        }
    }

    /* 9. LIKES, SAVES AND FOLLOWS */

    function toggleLike(id) {
        const video = getVideo(id);
        if (!video) return;

        video.liked = !video.liked;
        video.likes = Math.max(
            0,
            (Number(video.likes) || 0) + (video.liked ? 1 : -1)
        );

        saveState();
        renderFeed();
    }

    function toggleSave(id) {
        const video = getVideo(id);
        if (!video) return;

        video.saved = !video.saved;

        saveState();
        renderFeed();
        showToast(video.saved ? "Video saved ⭐" : "Video removed from saved");
    }

    function toggleFollow(id) {
        const video = getVideo(id);
        if (!video) return;

        video.following = !video.following;

        saveState();
        renderFeed();

        showToast(video.following
            ? `Following @${video.username}`
            : `Unfollowed @${video.username}`);
    }

    /* 10. COMMENTS */

    function renderComments(video) {
        const list = byId("comments") ||
            byId("commentsList") ||
            $(".comments-list", commentsModal);

        if (!list) return;

        if (!video.comments.length) {
            list.innerHTML = '<div class="no-comments">Be the first to comment 💬</div>';
            return;
        }

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

    function openComments(id) {
        const video = getVideo(id);
        if (!video) return;

        activeVideoId = id;

        if (!commentsModal) {
            showToast("Comments window is missing from index.html.");
            return;
        }

        const title = byId("commentsTitle") ||
            $("[data-comments-title]", commentsModal);

        if (title) title.textContent = `Comments · @${video.username}`;

        commentsModal.dataset.videoId = id;
        renderComments(video);
        showModal(commentsModal);

        const input = byId("commentInput") ||
            $("textarea, input[name='comment'], input[type='text']", commentsModal);

        if (input) input.focus();
    }

    function addComment(id, text) {
        const video = getVideo(id);
        const commentText = safeText(text);

        if (!video || !commentText) return;

        video.comments.push({
            id: makeId(),
            username: state.username || currentUser.username,
            avatar: getAvatar(),
            text: commentText,
            createdAt: Date.now()
        });

        saveState();
        renderFeed();
        openComments(id);
        showToast("Comment added 💬");
    }

    function bindComments() {
        const form = byId("commentForm") ||
            $("form", commentsModal);

        const input = byId("commentInput");

        if (!form || form.dataset.vtikBound) return;

        form.dataset.vtikBound = "true";

        form.addEventListener("submit", (event) => {
            event.preventDefault();

            const text = input
                ? input.value.trim()
                : ($("textarea, input[type='text']", form)?.value || "").trim();

            if (!text || !activeVideoId) return;

            addComment(activeVideoId, text);

            if (input) input.value = "";
        });
    }

    /* 11. SHARE VIDEO */

    async function shareVideo(id) {
        const video = getVideo(id);
        if (!video) return;

        const url = `${location.href.split("#")[0]}#video-${encodeURIComponent(id)}`;
        const data = {
            title: `V-Tik video by @${video.username}`,
            text: video.caption || "Watch this video on V-Tik!",
            url
        };

        try {
            if (navigator.share) {
                await navigator.share(data);
            } else if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(`${data.text}\n${data.url}`);
                showToast("Video link copied!");
            } else {
                window.prompt("Copy this video link:", url);
            }
        } catch (error) {
            if (error.name !== "AbortError") {
                console.warn("V-Tik: sharing failed.", error);
                showToast("Could not share this video.");
            }
        }
    }

    /* 12. MODAL HELPERS */

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

        const openDialogs = $$(".modal.open, [role='dialog'].open, .modal.active, [role='dialog'].active");

        if (!openDialogs.length) {
            document.body.classList.remove("modal-open");
        }
    }

    function openCreateModal() {
        if (!createModal) {
            if (videoPicker) videoPicker.click();
            else showToast("Create modal is missing from index.html.");
            return;
        }

        showModal(createModal);
    }

    /* 13. VIDEO UPLOAD */

    function getUploadElements() {
        return {
            input: videoPicker ||
                $("input[type='file'][accept*='video']"),

            caption: videoCaption ||
                byId("captionInput") ||
                $("textarea[name='caption']"),

            username: byId("creatorName") ||
                byId("uploadUsername"),

            submit: postVideo ||
                byId("publishVideo") ||
                byId("uploadSubmit")
        };
    }

    function clearPreview() {
        if (previewObjectUrl) {
            URL.revokeObjectURL(previewObjectUrl);
            previewObjectUrl = null;
        }

        if (uploadPreview) {
            uploadPreview.replaceChildren();
        }

        if (previewContainer) {
            previewContainer.classList.remove("has-preview");
        }

        if (uploadName) uploadName.textContent = "";
    }

    function previewSelectedVideo(file) {
        clearPreview();

        if (!file) return;

        if (!file.type.startsWith("video/")) {
            showToast("Please select a valid video file.");
            if (videoPicker) videoPicker.value = "";
            return;
        }

        previewObjectUrl = URL.createObjectURL(file);

        if (uploadName) uploadName.textContent = file.name;

        if (uploadPreview) {
            const preview = document.createElement("video");
            preview.src = previewObjectUrl;
            preview.controls = true;
            preview.playsInline = true;
            preview.preload = "metadata";
            uploadPreview.replaceChildren(preview);
        }

        if (previewContainer) {
            previewContainer.classList.add("has-preview");
        }
    }

    async function uploadVideo() {
        const { input, caption, username, submit } = getUploadElements();
        const file = input?.files?.[0];

        if (!file) {
            showToast("Choose a video before publishing.");
            return;
        }

        if (!file.type.startsWith("video/")) {
            showToast("Choose a valid video file.");
            return;
        }

        const maxSize = 250 * 1024 * 1024;

        if (file.size > maxSize) {
            showToast("Please choose a video smaller than 250 MB.");
            return;
        }

        if (submit) {
            submit.disabled = true;
            submit.dataset.originalText = submit.textContent;
            submit.textContent = "Publishing...";
        }

        const creatorName = safeText(
            username?.value,
            state.username || currentUser.username
        );

        const video = {
            id: makeId(),
            username: creatorName.replace(/^@/, "").replace(/\s+/g, "_"),
            displayName: creatorName,
            avatar: getAvatar(),
            caption: safeText(caption?.value, ""),
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

            state.videos.unshift(video);
            state.activeTab = "For You";
            state.currentSection = "home";
            state.activeTab = "For You";
            searchTerm = "";

            if (searchInput) searchInput.value = "";

            saveState();
            updateNavigation("home");
            renderFeed();

            if (input) input.value = "";
            if (caption) caption.value = "";
            clearPreview();

            hideModal(createModal);
            showToast("Video published successfully! 🎉");
        } catch (error) {
            console.error("V-Tik: video upload failed.", error);
            showToast("Upload failed. Check browser storage and try again.");
        } finally {
            if (submit) {
                submit.disabled = false;
                submit.textContent = submit.dataset.originalText || "Publish";
                delete submit.dataset.originalText;
            }
        }
    }

    function bindUploadControls() {
        const { input, submit } = getUploadElements();

        if (input && !input.dataset.vtikBound) {
            input.dataset.vtikBound = "true";

            input.addEventListener("change", () => {
                previewSelectedVideo(input.files?.[0]);
            });
        }

        if (uploadZone && !uploadZone.dataset.vtikBound) {
            uploadZone.dataset.vtikBound = "true";

            uploadZone.addEventListener("click", (event) => {
                if (event.target.closest("button, input, video")) return;
                input?.click();
            });

            uploadZone.addEventListener("dragover", (event) => {
                event.preventDefault();
                uploadZone.classList.add("dragging");
            });

            uploadZone.addEventListener("dragleave", () => {
                uploadZone.classList.remove("dragging");
            });

            uploadZone.addEventListener("drop", (event) => {
                event.preventDefault();
                uploadZone.classList.remove("dragging");

                const file = event.dataTransfer?.files?.[0];
                if (!file) return;

                if (!file.type.startsWith("video/")) {
                    showToast("Drop a video file to upload.");
                    return;
                }

                if (input) {
                    try {
                        const transfer = new DataTransfer();
                        transfer.items.add(file);
                        input.files = transfer.files;
                    } catch (error) {
                        console.warn("V-Tik: could not attach dropped file.", error);
                    }
                }

                previewSelectedVideo(file);
            });
        }

        if (submit && !submit.dataset.vtikBound) {
            submit.dataset.vtikBound = "true";

            submit.addEventListener("click", (event) => {
                event.preventDefault();
                uploadVideo();
            });
        }
    }

    /* 14. FULLSCREEN VIEWER */

    async function openViewer(id) {
        const video = getVideo(id);
        if (!video) return;

        activeVideoId = id;

        if (!viewer) {
            const feedVideo = $(`.feed-video[data-video-id="${CSS.escape(id)}"]`, feed);

            if (feedVideo?.requestFullscreen) {
                try {
                    await feedVideo.requestFullscreen();
                } catch (error) {
                    showToast("Fullscreen is unavailable in this browser.");
                }
            } else {
                showToast("Fullscreen viewer is missing from index.html.");
            }

            return;
        }

        const viewerVideo = byId("viewerVideo") || $("video", viewer);

        if (!viewerVideo) {
            showToast("Add a video element to the fullscreen viewer.");
            return;
        }

        if (viewerObjectUrl) {
            URL.revokeObjectURL(viewerObjectUrl);
            viewerObjectUrl = null;
        }

        let source = "";

        try {
            source = await resolveVideoSource(video);
        } catch (error) {
            console.error(error);
        }

        if (!source) {
            showToast("This video file is unavailable.");
            return;
        }

        if (source.startsWith("blob:")) viewerObjectUrl = source;

        viewerVideo.src = source;
        viewerVideo.loop = true;
        viewerVideo.playsInline = true;
        viewerVideo.muted = false;

        showModal(viewer);

        try {
            await viewerVideo.play();
        } catch (_) {
            // The user can press play if autoplay is blocked.
        }
    }

    function closeViewer() {
        if (!viewer) return;

        const viewerVideo = byId("viewerVideo") || $("video", viewer);

        if (viewerVideo) {
            viewerVideo.pause();
            viewerVideo.removeAttribute("src");
            viewerVideo.load();
        }

        if (viewerObjectUrl) {
            URL.revokeObjectURL(viewerObjectUrl);
            viewerObjectUrl = null;
        }

        hideModal(viewer);
    }

    /* 15. NAVIGATION */

    const sectionMap = {
        home: "For You",
        discover: "Explore",
        following: "Following",
        liked: "Liked",
        saved: "Saved",
        messages: "Messages",
        trending: "Trending",
        music: "Music",
        gaming: "Gaming",
        challenges: "Challenges"
    };

    function updateNavigation(section) {
        $$("[data-section]").forEach((button) => {
            const active = button.dataset.section === section;
            button.classList.toggle("active", active);

            if (active) {
                button.setAttribute("aria-current", "page");
            } else {
                button.removeAttribute("aria-current");
            }
        });
    }

    function setActiveTab(section) {
        const allowed = Object.prototype.hasOwnProperty.call(sectionMap, section)
            ? section
            : "home";

        state.currentSection = allowed;
        state.activeTab = sectionMap[allowed];

        updateNavigation(allowed);
        saveState();

        if (["Messages", "Music", "Gaming", "Challenges"].includes(state.activeTab)) {
            if (state.activeTab === "Messages") {
                showToast("Messages will be available when messaging is connected.");
            } else {
                showToast(`${state.activeTab} is ready for your next update.`);
            }
        }

        renderFeed();
    }

    function bindNavigation() {
        document.addEventListener("click", (event) => {
            const button = event.target.closest("[data-section]");
            if (!button) return;

            event.preventDefault();
            setActiveTab(button.dataset.section);
        });
    }

    /* 16. SEARCH */

    function bindSearch() {
        if (!searchInput || searchInput.dataset.vtikBound) return;

        searchInput.dataset.vtikBound = "true";

        searchInput.addEventListener("input", () => {
            searchTerm = searchInput.value.trim();
            renderFeed();
        });

        const clearButton = byId("clearSearch");

        if (clearButton && !clearButton.dataset.vtikBound) {
            clearButton.dataset.vtikBound = "true";

            clearButton.addEventListener("click", () => {
                searchInput.value = "";
                searchTerm = "";
                renderFeed();
                searchInput.focus();
            });
        }

        searchInput.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                searchInput.value = "";
                searchTerm = "";
                renderFeed();
            }
        });
    }

    /* 17. FEED BUTTON ACTIONS */

    function bindFeedActions() {
        if (!feed || feed.dataset.vtikActionsBound) return;
        feed.dataset.vtikActionsBound = "true";

        feed.addEventListener("click", (event) => {
            const button = event.target.closest("[data-action]");

            if (!button || !feed.contains(button)) return;

            const action = button.dataset.action;
            const id = button.dataset.videoId ||
                button.closest("[data-video-id]")?.dataset.videoId;

            if (action === "open-create") {
                openCreateModal();
                return;
            }

            if (action === "sound") {
                const videoElement = $(
                    `.feed-video[data-video-id="${CSS.escape(id || "")}"]`,
                    feed
                );

                if (videoElement) {
                    videoElement.muted = !videoElement.muted;
                    button.textContent = videoElement.muted ? "🔇" : "🔊";
                }

                return;
            }

            if (!id) return;

            switch (action) {
                case "like":
                    toggleLike(id);
                    break;
                case "save":
                    toggleSave(id);
                    break;
                case "follow":
                    toggleFollow(id);
                    break;
                case "comment":
                    openComments(id);
                    break;
                case "share":
                    shareVideo(id);
                    break;
                case "expand":
                    openViewer(id);
                    break;
            }
        });
    }

    /* 18. CREATE BUTTONS AND MODAL CONTROLS */

    function bindModalControls() {
        // Do not use inline onclick handlers in index.html.
        ["createTop", "mobileCreate"].forEach((id) => {
            const button = byId(id);
            if (!button || button.dataset.vtikBound) return;

            button.dataset.vtikBound = "true";

            button.addEventListener("click", (event) => {
                event.preventDefault();
                openCreateModal();
            });
        });

        const closeCreate = byId("closeCreate");
        const closeComments = byId("closeComments");
        const viewerClose = byId("viewerClose");

        closeCreate?.addEventListener("click", () => hideModal(createModal));
        closeComments?.addEventListener("click", () => hideModal(commentsModal));
        viewerClose?.addEventListener("click", closeViewer);

        byId("createBackdrop")?.addEventListener("click", () => hideModal(createModal));
        byId("commentsBackdrop")?.addEventListener("click", () => hideModal(commentsModal));

        // Support click-on-backdrop layouts where the backdrop is inside the modal.
        [createModal, commentsModal, viewer].forEach((modal) => {
            if (!modal || modal.dataset.vtikBackdropBound) return;

            modal.dataset.vtikBackdropBound = "true";

            modal.addEventListener("click", (event) => {
                if (event.target !== modal) return;

                if (modal === viewer) closeViewer();
                else hideModal(modal);
            });
        });

        document.addEventListener("keydown", (event) => {
            if (event.key !== "Escape") return;

            hideModal(createModal);
            hideModal(commentsModal);
            closeViewer();
        });

        // Optional mobile create button from alternative HTML versions.
        byId("mobileCreate")?.setAttribute("aria-label", "Create a video");
    }

    /* 19. VIDEO ERROR AND LOADING STATES */

    function bindVideoEvents() {
        if (!feed || feed.dataset.vtikVideoEventsBound) return;
        feed.dataset.vtikVideoEventsBound = "true";

        feed.addEventListener("loadstart", (event) => {
            const video = event.target.closest?.(".feed-video");
            video?.closest(".video-stage")?.classList.add("is-loading");
        }, true);

        feed.addEventListener("loadeddata", (event) => {
            const video = event.target.closest?.(".feed-video");
            const stage = video?.closest(".video-stage");

            stage?.classList.remove("is-loading", "video-unavailable");
            const notice = $(".video-unavailable-message", stage);
            notice?.remove();
        }, true);

        feed.addEventListener("error", (event) => {
            const video = event.target.closest?.(".feed-video");
            if (!video) return;

            const stage = video.closest(".video-stage");
            stage?.classList.remove("is-loading");
            video.classList.add("video-source-error");
        }, true);
    }

    /* 20. INITIALIZE */

    function initializeVtik() {
        bindNavigation();
        bindSearch();
        bindFeedActions();
        bindModalControls();
        bindUploadControls();
        bindComments();
        bindVideoEvents();

        updateNavigation(state.currentSection || "home");
        updateProfileButton();

        // Keep the feed empty when no videos have been uploaded.
        renderFeed();

        console.info("V-Tik is ready.");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeVtik, {
            once: true
        });
    } else {
        initializeVtik();
    }
})();
```
