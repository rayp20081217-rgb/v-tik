
"use strict";

/* =========================================================
   V-TIK — COMPLETE FRONT-END APPLICATION
   Requires: index.html + style.css + app.js

   Features:
   - Video feed and automatic playback
   - Search and navigation
   - Likes, comments, saves and follows
   - Video upload with IndexedDB storage
   - Restoring uploaded videos after refresh
   - Fullscreen video viewer
   - Share, sound and notifications
========================================================= */


/* =========================================================
   1. APP STATE
========================================================= */

let videos = [];
let currentVideoId = null;
let selectedVideoFile = null;
let selectedVideoURL = null;
let soundEnabled = false;
let toastTimeout = null;
let feedObserver = null;
let currentSection = "home";
let feedGeneration = 0;

const DATABASE_NAME = "VTikDatabase";
const DATABASE_VERSION = 1;
const VIDEO_STORE = "videos";
const FEED_STORAGE_KEY = "vtik_feed";


/* =========================================================
   2. DEFAULT VIDEOS

   Place your actual MP4 files inside the videos folder.
========================================================= */

const DEFAULT_VIDEOS = [
    {
        id: "vtik-001",
        src: "videos/vtik-demo-1.mp4",
        username: "@vtik_creator",
        avatar: "VT",
        caption: "Welcome to V-Tik! Build, share and discover amazing videos.",
        tags: "#VTik #Trending #Creators",
        music: "♫ Original sound — V-Tik",
        badge: "FOR YOU",
        likes: 1200,
        commentsCount: 184,
        liked: false,
        saved: false,
        following: false,
        comments: [
            { username: "@john", text: "Welcome to V-Tik! 🔥" },
            { username: "@mary", text: "This is amazing!" }
        ]
    },
    {
        id: "vtik-002",
        src: "videos/vtik-demo-2.mp4",
        username: "@tripple_r",
        avatar: "RR",
        caption: "Good vibes only! What are you posting today?",
        tags: "#Music #Dance #Viral #VTik",
        music: "♫ Trending sound — V-Tik",
        badge: "TRENDING",
        likes: 8700,
        commentsCount: 492,
        liked: false,
        saved: false,
        following: false,
        comments: [
            { username: "@dancer", text: "This is fire 🔥🔥" }
        ]
    },
    {
        id: "vtik-003",
        src: "videos/vtik-demo-3.mp4",
        username: "@discover_uganda",
        avatar: "UG",
        caption: "Discover beautiful places and everyday moments. 🇺🇬",
        tags: "#Uganda #Travel #Lifestyle",
        music: "♫ Original sound — Discover",
        badge: "DISCOVER",
        likes: 3400,
        commentsCount: 211,
        liked: false,
        saved: false,
        following: false,
        comments: [
            { username: "@uganda", text: "Beautiful Uganda 🇺🇬" }
        ]
    }
];


/* =========================================================
   3. DOM ELEMENTS
========================================================= */

const $ = (selector, parent = document) =>
    parent.querySelector(selector);

const $$ = (selector, parent = document) =>
    [...parent.querySelectorAll(selector)];

const feed = $("#feed");
const searchInput = $("#searchInput");
const clearSearch = $("#clearSearch");

const createTop = $("#createTop");
const mobileCreate = $("#mobileCreate");
const notificationBtn = $("#notificationBtn");
const profileButton = $("#profileButton");
const mobileProfile = $("#mobileProfile");

const commentsModal = $("#commentsModal");
const closeCommentsButton = $("#closeComments");
const commentsContainer = $("#comments");
const commentForm = $("#commentForm");
const commentInput = $("#commentInput");
const postCommentButton = $("#postCommentBtn");

const createModal = $("#createModal");
const closeCreateButton = $("#closeCreate");
const videoPicker = $("#videoPicker");
const uploadZone = $("#uploadZone");
const previewContainer = $("#previewContainer");
const preview = $("#preview");
const videoCaption = $("#videoCaption");
const postVideoButton = $("#postVideo");
const uploadName = $("#uploadName");

const videoViewer = $("#videoViewer");
const viewerClose = $("#viewerClose");
const viewerVideo = $("#viewerVideo");

const toast = $("#toast");


/* =========================================================
   4. START APPLICATION
========================================================= */

function initializeApp() {
    setupSearch();
    setupCreateButtons();
    setupComments();
    setupViewer();
    setupNavigation();
    setupProfileButtons();
    setupNotifications();
    setupKeyboardControls();
    setupFeedActions();
    setupCommentInput();

    updateProfileButton();

    loadFeed();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeApp, {
        once: true
    });
} else {
    initializeApp();
}


/* =========================================================
   5. DEFAULT DATA AND FEED STORAGE
========================================================= */

function cloneDefaults() {
    return JSON.parse(JSON.stringify(DEFAULT_VIDEOS));
}

function normalizeVideo(video) {
    return {
        id: String(video.id || createId("video")),
        src: typeof video.src === "string" ? video.src : "",
        localFileId: video.localFileId || null,
        localURL: null,
        username: video.username || "@vtik_user",
        avatar: video.avatar || "VT",
        caption: video.caption || "",
        tags: video.tags || "",
        music: video.music || "♫ Original sound",
        badge: video.badge || "FOR YOU",
        likes: Math.max(0, Number(video.likes) || 0),
        commentsCount: Math.max(0, Number(video.commentsCount) || 0),
        liked: Boolean(video.liked),
        saved: Boolean(video.saved),
        following: Boolean(video.following),
        comments: Array.isArray(video.comments)
            ? video.comments
                .filter(item => item && typeof item === "object")
                .map(item => ({
                    username: String(item.username || "@user"),
                    text: String(item.text || "")
                }))
            : []
    };
}

function loadFeed() {
    let storedVideos = null;

    try {
        const raw = localStorage.getItem(FEED_STORAGE_KEY);

        if (raw) {
            const parsed = JSON.parse(raw);

            if (Array.isArray(parsed)) {
                storedVideos = parsed;
            }
        }
    } catch (error) {
        console.warn("Could not read saved V-Tik feed:", error);
    }

    videos = (storedVideos && storedVideos.length
        ? storedVideos
        : cloneDefaults()
    ).map(normalizeVideo);

    saveFeed();

    // Restore stored upload files before rendering the feed.
    restoreUploadedVideos();
}

function saveFeed() {
    try {
        const data = videos.map(video => {
            const copy = { ...video };

            // Blob URLs are temporary and cannot be restored
            // after a browser refresh. Save the IndexedDB ID instead.
            delete copy.localURL;

            return copy;
        });

        localStorage.setItem(
            FEED_STORAGE_KEY,
            JSON.stringify(data)
        );

        return true;
    } catch (error) {
        console.error("Could not save V-Tik feed:", error);
        showToast("Browser storage is full or unavailable.");
        return false;
    }
}


/* =========================================================
   6. VIDEO FEED RENDERING
========================================================= */

function renderFeed(list = videos) {
    if (!feed) {
        console.error("V-Tik needs an element with id='feed'.");
        return;
    }

    feedGeneration++;

    if (feedObserver) {
        feedObserver.disconnect();
        feedObserver = null;
    }

    feed.replaceChildren();

    if (!list.length) {
        const empty = document.createElement("div");
        empty.className = "empty-feed";

        empty.innerHTML = `
            <div class="empty-icon">🔎</div>
            <h2>No videos found</h2>
            <p>Try another search or explore more videos.</p>
            <button class="create-empty" id="emptyCreateButton"
                    type="button">＋ Create Video</button>
        `;

        feed.appendChild(empty);

        $("#emptyCreateButton", empty)?.addEventListener(
            "click",
            openCreateModal
        );

        return;
    }

    const fragment = document.createDocumentFragment();

    list.forEach(video => {
        fragment.appendChild(createVideoCard(video));
    });

    feed.appendChild(fragment);

    setupVideoPlayback();
}

function createVideoCard(video) {
    const article = document.createElement("article");
    article.className = "video-card";
    article.dataset.id = video.id;

    const source = video.localURL || video.src || "";

    article.innerHTML = `
        <div class="video-wrapper">

            <video
                class="feed-video"
                src="${escapeHTML(source)}"
                loop
                muted
                playsinline
                preload="metadata"
                aria-label="${escapeHTML(video.caption)}"
            ></video>

            <div class="video-gradient"></div>

            <div class="video-badge">
                ${escapeHTML(video.badge)}
            </div>

            <button class="video-sound"
                    data-action="sound"
                    type="button"
                    aria-label="Toggle sound">
                ${soundEnabled ? "🔊" : "🔇"}
            </button>

            <button class="video-expand"
                    data-action="fullscreen"
                    type="button"
                    aria-label="Open fullscreen video">
                ⛶
            </button>

            <div class="video-info">

                <div class="creator-row">
                    <div class="creator-avatar">
                        ${escapeHTML(video.avatar)}
                    </div>

                    <div class="creator-details">
                        <strong>${escapeHTML(video.username)}</strong>
                        <span>${escapeHTML(video.music)}</span>
                    </div>

                    <button
                        class="follow-btn ${video.following ? "following" : ""}"
                        data-action="follow"
                        type="button"
                        aria-pressed="${video.following}"
                    >
                        ${video.following ? "Following" : "Follow"}
                    </button>
                </div>

                <p class="caption">${escapeHTML(video.caption)}</p>
                <p class="tags">${escapeHTML(video.tags)}</p>
            </div>

            <div class="video-actions">

                <button class="action-btn ${video.liked ? "active" : ""}"
                        data-action="like"
                        type="button"
                        aria-label="${video.liked ? "Unlike" : "Like"} video"
                        aria-pressed="${video.liked}">
                    <span>${video.liked ? "♥" : "♡"}</span>
                    <small>${formatNumber(video.likes)}</small>
                </button>

                <button class="action-btn"
                        data-action="comment"
                        type="button"
                        aria-label="View comments">
                    <span>💬</span>
                    <small>${formatNumber(video.commentsCount)}</small>
                </button>

                <button class="action-btn ${video.saved ? "active" : ""}"
                        data-action="save"
                        type="button"
                        aria-label="${video.saved ? "Unsave" : "Save"} video"
                        aria-pressed="${video.saved}">
                    <span>🔖</span>
                    <small>${video.saved ? "Saved" : "Save"}</small>
                </button>

                <button class="action-btn"
                        data-action="share"
                        type="button"
                        aria-label="Share video">
                    <span>↗</span>
                    <small>Share</small>
                </button>

            </div>
        </div>
    `;

    const player = $(".feed-video", article);

    player.addEventListener("error", () => {
        if (player.dataset.errorShown) return;
        player.dataset.errorShown = "true";
        showToast("A video could not load. Check its file path.");
    });

    return article;
}


/* =========================================================
   7. VIDEO AUTOPLAY AND PAUSE
========================================================= */

function setupVideoPlayback() {
    const players = $$(".feed-video", feed);

    if (!players.length) return;

    const generation = feedGeneration;

    if ("IntersectionObserver" in window) {
        feedObserver = new IntersectionObserver(entries => {
            if (generation !== feedGeneration) return;

            entries.forEach(entry => {
                const player = entry.target;

                if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
                    players.forEach(other => {
                        if (other !== player) other.pause();
                    });

                    player.muted = !soundEnabled;

                    player.play().catch(() => {
                        // Browsers may block autoplay until user interaction.
                    });
                } else {
                    player.pause();
                }
            });
        }, { threshold: [0, 0.6, 1] });

        players.forEach(player => feedObserver.observe(player));
    } else {
        players.forEach(player => {
            player.muted = true;
        });
    }
}


/* =========================================================
   8. FEED ACTIONS
========================================================= */

function setupFeedActions() {
    feed?.addEventListener("click", event => {
        const button = event.target.closest("[data-action]");

        if (!button || !feed.contains(button)) return;

        const card = button.closest(".video-card");
        if (!card) return;

        const video = videos.find(item => item.id === card.dataset.id);
        if (!video) return;

        // Prevent the video click handler from opening fullscreen
        // when the user clicks an action button.
        event.preventDefault();

        switch (button.dataset.action) {
            case "like":
                toggleLike(video);
                break;

            case "comment":
                openComments(video);
                break;

            case "save":
                toggleSaved(video);
                break;

            case "share":
                shareVideo(video);
                break;

            case "follow":
                toggleFollow(video);
                break;

            case "sound":
                toggleSound();
                break;

            case "fullscreen":
                openViewer(video.localURL || video.src);
                break;
        }
    });

    feed?.addEventListener("click", event => {
        const player = event.target.closest("video.feed-video");

        if (!player) return;

        // Open the fullscreen viewer when the video itself is clicked.
        // Native controls are intentionally not shown on feed videos.
        const card = player.closest(".video-card");
        const video = videos.find(item => item.id === card?.dataset.id);

        if (video) {
            openViewer(video.localURL || video.src);
        }
    });
}

function toggleLike(video) {
    video.liked = !video.liked;
    video.likes = Math.max(0, video.likes + (video.liked ? 1 : -1));

    saveFeed();
    refreshCurrentFeed();

    showToast(video.liked ? "You liked this video ❤️" : "Like removed");
}

function toggleSaved(video) {
    video.saved = !video.saved;

    saveFeed();
    refreshCurrentFeed();

    showToast(video.saved ? "Video saved 🔖" : "Video removed from saved");
}

function toggleFollow(video) {
    video.following = !video.following;

    saveFeed();
    refreshCurrentFeed();

    showToast(
        video.following
            ? `Following ${video.username}`
            : `Unfollowed ${video.username}`
    );
}

function toggleSound() {
    soundEnabled = !soundEnabled;

    $$(".feed-video", feed).forEach(player => {
        player.muted = !soundEnabled;
    });

    $$(".video-sound", feed).forEach(button => {
        button.textContent = soundEnabled ? "🔊" : "🔇";
    });

    showToast(soundEnabled ? "Sound turned on 🔊" : "Sound turned off 🔇");
}

function refreshCurrentFeed() {
    if (searchInput?.value.trim()) {
        performSearch();
    } else {
        changeSection(currentSection, false);
    }
}


/* =========================================================
   9. SEARCH
========================================================= */

function setupSearch() {
    searchInput?.addEventListener("input", performSearch);

    clearSearch?.addEventListener("click", () => {
        if (searchInput) searchInput.value = "";
        if (clearSearch) clearSearch.hidden = true;

        changeSection(currentSection, false);
        searchInput?.focus();
    });
}

function performSearch() {
    const query = searchInput?.value.trim().toLowerCase() || "";

    if (clearSearch) {
        clearSearch.hidden = query.length === 0;
    }

    if (!query) {
        changeSection(currentSection, false);
        return;
    }

    const results = videos.filter(video => {
        const searchableText = [
            video.username,
            video.caption,
            video.tags,
            video.music,
            video.badge
        ].filter(Boolean).join(" ").toLowerCase();

        return searchableText.includes(query);
    });

    renderFeed(results);
}


/* =========================================================
   10. COMMENTS
========================================================= */

function setupComments() {
    closeCommentsButton?.addEventListener("click", closeCommentsWindow);

    commentsModal?.addEventListener("click", event => {
        if (event.target === commentsModal) {
            closeCommentsWindow();
        }
    });

    commentForm?.addEventListener("submit", postComment);
}

function setupCommentInput() {
    commentInput?.addEventListener("input", () => {
        if (postCommentButton) {
            postCommentButton.disabled = !commentInput.value.trim();
        }
    });
}

function openComments(video) {
    currentVideoId = video.id;

    renderComments(video);

    commentsModal?.classList.add("show");
    commentsModal?.setAttribute("aria-hidden", "false");

    setTimeout(() => commentInput?.focus(), 100);
}

function renderComments(video) {
    if (!commentsContainer) return;

    commentsContainer.replaceChildren();

    if (!video.comments.length) {
        commentsContainer.innerHTML = `
            <div class="no-comments">
                <div>💬</div>
                <p>No comments yet.</p>
                <span>Be the first to comment.</span>
            </div>
        `;
        return;
    }

    const fragment = document.createDocumentFragment();

    video.comments.forEach(comment => {
        const row = document.createElement("div");
        row.className = "comment";

        const avatar = document.createElement("div");
        avatar.className = "comment-avatar";
        avatar.textContent = comment.username
            .replace("@", "")
            .slice(0, 2)
            .toUpperCase();

        const body = document.createElement("div");
        body.className = "comment-body";

        const username = document.createElement("strong");
        username.textContent = comment.username;

        const message = document.createElement("p");
        message.textContent = comment.text;

        body.append(username, message);
        row.append(avatar, body);
        fragment.appendChild(row);
    });

    commentsContainer.appendChild(fragment);
    commentsContainer.scrollTop = commentsContainer.scrollHeight;
}

function postComment(event) {
    event.preventDefault();

    const text = commentInput?.value.trim();
    if (!text || !currentVideoId) return;

    const video = videos.find(item => item.id === currentVideoId);
    if (!video) return;

    video.comments.push({
        username: getCurrentUsername(),
        text
    });

    video.commentsCount += 1;

    if (commentInput) commentInput.value = "";
    if (postCommentButton) postCommentButton.disabled = true;

    saveFeed();
    renderComments(video);
    refreshCurrentFeed();

    // The comments dialog stays open after posting.
    currentVideoId = video.id;
    showToast("Comment posted 💬");
}

function closeCommentsWindow() {
    commentsModal?.classList.remove("show");
    commentsModal?.setAttribute("aria-hidden", "true");
    currentVideoId = null;
}


/* =========================================================
   11. SHARE VIDEO
========================================================= */

async function shareVideo(video) {
    const text = `${video.caption}\n${video.tags}`;

    try {
        if (navigator.share) {
            await navigator.share({
                title: "V-Tik",
                text,
                url: window.location.href
            });
            return;
        }

        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(
                `${text}\n${window.location.href}`
            );

            showToast("Link copied 🔗");
            return;
        }

        window.prompt("Copy this link:", window.location.href);
    } catch (error) {
        if (error.name !== "AbortError") {
            console.error("Sharing failed:", error);
            showToast("Could not share this video.");
        }
    }
}


/* =========================================================
   12. CREATE AND UPLOAD VIDEO
========================================================= */

function setupCreateButtons() {
    createTop?.addEventListener("click", openCreateModal);
    mobileCreate?.addEventListener("click", openCreateModal);
    closeCreateButton?.addEventListener("click", closeCreateModal);

    createModal?.addEventListener("click", event => {
        if (event.target === createModal) closeCreateModal();
    });

    uploadZone?.addEventListener("click", event => {
        if (event.target.closest("label")) return;
        videoPicker?.click();
    });

    videoPicker?.addEventListener("change", selectVideoFile);
    postVideoButton?.addEventListener("click", uploadVideo);
}

function openCreateModal() {
    createModal?.classList.add("show");
    createModal?.setAttribute("aria-hidden", "false");
}

function closeCreateModal() {
    createModal?.classList.remove("show");
    createModal?.setAttribute("aria-hidden", "true");

    // Only revoke a URL if it belongs to a selected file that
    // has not been successfully posted.
    if (selectedVideoURL) {
        URL.revokeObjectURL(selectedVideoURL);
    }

    selectedVideoURL = null;
    selectedVideoFile = null;

    if (videoPicker) videoPicker.value = "";
    if (videoCaption) videoCaption.value = "";
    if (uploadName) uploadName.textContent = "";

    if (preview) {
        preview.pause();
        preview.removeAttribute("src");
        preview.load();
        preview.hidden = true;
    }

    if (previewContainer) previewContainer.hidden = true;
    if (uploadZone) uploadZone.hidden = false;
    if (postVideoButton) postVideoButton.disabled = true;
}

function selectVideoFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("video/")) {
        showToast("Please choose a video file.");
        event.target.value = "";
        return;
    }

    // Optional client-side size limit: 100 MB.
    const maxSize = 100 * 1024 * 1024;

    if (file.size > maxSize) {
        showToast("Choose a video smaller than 100 MB.");
        event.target.value = "";
        return;
    }

    if (selectedVideoURL) {
        URL.revokeObjectURL(selectedVideoURL);
    }

    selectedVideoFile = file;
    selectedVideoURL = URL.createObjectURL(file);

    if (preview) {
        preview.src = selectedVideoURL;
        preview.hidden = false;
        preview.load();
    }

    if (previewContainer) previewContainer.hidden = false;
    if (uploadZone) uploadZone.hidden = true;

    if (uploadName) {
        uploadName.textContent = `${file.name} • ${formatFileSize(file.size)}`;
    }

    if (postVideoButton) postVideoButton.disabled = false;
}

async function uploadVideo() {
    if (!selectedVideoFile || !selectedVideoURL) {
        showToast("Select a video first.");
        return;
    }

    if (postVideoButton) {
        postVideoButton.disabled = true;
        postVideoButton.textContent = "Posting...";
    }

    try {
        const fileId = await saveVideoToDatabase(selectedVideoFile);

        const newVideo = normalizeVideo({
            id: createId("user"),
            src: "",
            localFileId: fileId,
            username: getCurrentUsername(),
            avatar: getCurrentAvatar(),
            caption: videoCaption?.value.trim() || "My new V-Tik video 🎬",
            tags: "#VTik #NewVideo",
            music: "♫ Original sound",
            badge: "NEW",
            likes: 0,
            commentsCount: 0,
            comments: [],
            liked: false,
            saved: false,
            following: false
        });

        // Keep the temporary URL for the feed. Do not revoke it
        // when closing the upload modal.
        newVideo.localURL = selectedVideoURL;
        selectedVideoURL = null;
        selectedVideoFile = null;

        videos.unshift(newVideo);
        saveFeed();

        currentSection = "home";

        if (searchInput) searchInput.value = "";
        if (clearSearch) clearSearch.hidden = true;

        updateActiveNavigation("home");
        renderFeed(videos);

        closeCreateModal();
        showToast("Video posted on this device 🎉");
    } catch (error) {
        console.error("Video upload failed:", error);
        showToast("Could not save your video. Check browser storage.");
    } finally {
        if (postVideoButton) {
            postVideoButton.disabled = !selectedVideoFile;
            postVideoButton.textContent = "Post Video";
        }
    }
}


/* =========================================================
   13. INDEXEDDB — SAVE UPLOADED VIDEO FILES
========================================================= */

function openDatabase() {
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) {
            reject(new Error("IndexedDB is not supported."));
            return;
        }

        const request = indexedDB.open(
            DATABASE_NAME,
            DATABASE_VERSION
        );

        request.onupgradeneeded = event => {
            const database = event.target.result;

            if (!database.objectStoreNames.contains(VIDEO_STORE)) {
                database.createObjectStore(VIDEO_STORE, {
                    keyPath: "id"
                });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveVideoToDatabase(file) {
    const database = await openDatabase();
    const id = createId("file");

    return new Promise((resolve, reject) => {
        const transaction = database.transaction(VIDEO_STORE, "readwrite");
        const store = transaction.objectStore(VIDEO_STORE);

        store.put({
            id,
            file,
            name: file.name,
            type: file.type,
            size: file.size,
            savedAt: Date.now()
        });

        transaction.oncomplete = () => {
            database.close();
            resolve(id);
        };

        transaction.onerror = () => {
            const error = transaction.error;
            database.close();
            reject(error);
        };

        transaction.onabort = () => {
            const error = transaction.error || new Error("Storage transaction aborted.");
            database.close();
            reject(error);
        };
    });
}

async function getStoredVideo(id) {
    const database = await openDatabase();

    return new Promise((resolve, reject) => {
        const transaction = database.transaction(VIDEO_STORE, "readonly");
        const request = transaction.objectStore(VIDEO_STORE).get(id);

        request.onsuccess = () => {
            const result = request.result;
            database.close();
            resolve(result?.file || null);
        };

        request.onerror = () => {
            const error = request.error;
            database.close();
            reject(error);
        };
    });
}

async function restoreUploadedVideos() {
    for (const video of videos) {
        if (!video.localFileId) continue;

        try {
            const file = await getStoredVideo(video.localFileId);

            if (file) {
                video.localURL = URL.createObjectURL(file);
            }
        } catch (error) {
            console.warn("Could not restore uploaded video:", error);
        }
    }

    renderFeed();
}


/* =========================================================
   14. FULLSCREEN VIEWER
========================================================= */

function setupViewer() {
    viewerClose?.addEventListener("click", closeViewer);

    videoViewer?.addEventListener("click", event => {
        if (event.target === videoViewer) closeViewer();
    });
}

function openViewer(source) {
    if (!videoViewer || !viewerVideo || !source) {
        showToast("This video has no playable source.");
        return;
    }

    // Pause feed videos while the viewer is open.
    $$(".feed-video", feed).forEach(player => player.pause());

    viewerVideo.src = source;
    viewerVideo.muted = !soundEnabled;

    videoViewer.classList.add("show");
    videoViewer.setAttribute("aria-hidden", "false");

    viewerVideo.play().catch(() => {
        // The user can press play if autoplay is blocked.
    });
}

function closeViewer() {
    if (!videoViewer || !viewerVideo) return;

    viewerVideo.pause();
    viewerVideo.removeAttribute("src");
    viewerVideo.load();

    videoViewer.classList.remove("show");
    videoViewer.setAttribute("aria-hidden", "true");
}


/* =========================================================
   15. NAVIGATION
========================================================= */

function setupNavigation() {
    $$("[data-section]").forEach(button => {
        button.addEventListener("click", () => {
            const section = button.dataset.section;

            currentSection = section;

            if (searchInput) searchInput.value = "";
            if (clearSearch) clearSearch.hidden = true;

            updateActiveNavigation(section);
            changeSection(section);
        });
    });
}

function updateActiveNavigation(section) {
    $$("[data-section]").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.section === section
        );
    });
}

function changeSection(section, notify = true) {
    currentSection = section;

    if (section === "home") {
        renderFeed(videos);
        return;
    }

    if (section === "liked") {
        renderFeed(videos.filter(video => video.liked));
        if (notify) showToast("Your liked videos ❤️");
        return;
    }

    if (section === "saved") {
        renderFeed(videos.filter(video => video.saved));
        if (notify) showToast("Your saved videos 🔖");
        return;
    }

    if (section === "following") {
        renderFeed(videos.filter(video => video.following));
        if (notify) showToast("Videos from followed creators");
        return;
    }

    if (section === "trending") {
        const trending = [...videos].sort(
            (a, b) => b.likes - a.likes
        );

        renderFeed(trending);
        if (notify) showToast("Trending videos 🔥");
        return;
    }

    if (section === "discover") {
        renderFeed(videos);
        if (notify) showToast("Discover videos 🔎");
        return;
    }

    if (section === "music") {
        renderFeed(videos.filter(video =>
            `${video.tags} ${video.music}`.toLowerCase()
                .match(/music|sound|song|dance/)
        ));

        if (notify) showToast("Music videos 🎵");
        return;
    }

    if (section === "gaming") {
        renderFeed(videos.filter(video =>
            `${video.tags} ${video.caption}`.toLowerCase()
                .includes("gaming")
        ));

        if (notify) showToast("Gaming videos 🎮");
        return;
    }

    if (section === "challenges") {
        renderFeed(videos.filter(video =>
            `${video.tags} ${video.caption}`.toLowerCase()
                .includes("challenge")
        ));

        if (notify) showToast("Challenge videos 🏆");
        return;
    }

    if (section === "messages") {
        showToast("Messaging is not connected yet 💬");
        return;
    }

    renderFeed(videos);
}


/* =========================================================
   16. PROFILE
========================================================= */

function setupProfileButtons() {
    profileButton?.addEventListener("click", openProfile);
    mobileProfile?.addEventListener("click", openProfile);
}

function openProfile(event) {
    // Update this destination if your profile page has a different name.
    // Example: account.html, profile.html, or log.html.
    window.location.href = "account.html";
}

function getCurrentUsername() {
    const stored =
        localStorage.getItem("vtik_username") ||
        localStorage.getItem("vtik_current_user") ||
        "vtik_user";

    return stored.startsWith("@") ? stored : `@${stored}`;
}

function getCurrentAvatar() {
    const name = localStorage.getItem("vtik_name") || "V T";

    const initials = name.trim()
        .split(/\s+/)
        .map(word => word[0] || "")
        .join("")
        .toUpperCase();

    return initials.slice(0, 2) || "VT";
}

function updateProfileButton() {
    const avatar = getCurrentAvatar();

    if (profileButton) {
        profileButton.innerHTML = `<span class="avatar small">${escapeHTML(avatar)}</span>`;
    }

    const mobileAvatar = $(".avatar", mobileProfile);

    if (mobileAvatar) {
        mobileAvatar.textContent = avatar;
    }
}


/* =========================================================
   17. NOTIFICATIONS
========================================================= */

function setupNotifications() {
    notificationBtn?.addEventListener("click", () => {
        showToast("You're all caught up! 🔔");
    });
}


/* =========================================================
   18. KEYBOARD CONTROLS
========================================================= */

function setupKeyboardControls() {
    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            closeViewer();
            closeCommentsWindow();

            if (createModal?.classList.contains("show")) {
                closeCreateModal();
            }
        }

        if (
            event.key === "/" &&
            !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName) &&
            !document.activeElement?.isContentEditable
        ) {
            event.preventDefault();
            searchInput?.focus();
        }
    });
}


/* =========================================================
   19. TOAST NOTIFICATIONS
========================================================= */

function showToast(message) {
    if (!toast) {
        console.info(message);
        return;
    }

    toast.textContent = message;
    toast.classList.add("show");
    toast.setAttribute("aria-hidden", "false");

    clearTimeout(toastTimeout);

    toastTimeout = setTimeout(() => {
        toast.classList.remove("show");
        toast.setAttribute("aria-hidden", "true");
    }, 2600);
}


/* =========================================================
   20. HELPERS
========================================================= */

function formatNumber(value) {
    const number = Number(value) || 0;

    if (number >= 1_000_000) {
        return `${(number / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
    }

    if (number >= 1_000) {
        return `${(number / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
    }

    return String(number);
}

function formatFileSize(bytes) {
    if (!bytes) return "0 KB";

    if (bytes >= 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function createId(prefix = "vtik") {
    if (window.crypto?.randomUUID) {
        return `${prefix}-${crypto.randomUUID()}`;
    }

    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}


/* =========================================================
   21. CLEANUP
========================================================= */

window.addEventListener("pagehide", () => {
    if (feedObserver) {
        feedObserver.disconnect();
        feedObserver = null;
    }

    videos.forEach(video => {
        if (video.localURL) {
            URL.revokeObjectURL(video.localURL);
            video.localURL = null;
        }
    });

    if (selectedVideoURL) {
        URL.revokeObjectURL(selectedVideoURL);
        selectedVideoURL = null;
    }
});
