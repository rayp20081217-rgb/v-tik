```javascript
"use strict";

/* =========================================================
   V-TIK APP
   ========================================================= */

/* -----------------------------
   APP STATE
----------------------------- */

let videos = [];
let currentVideoId = null;
let selectedVideoFile = null;
let selectedVideoURL = null;
let soundEnabled = true;
let toastTimeout = null;


/* =========================================================
   DEFAULT VIDEOS
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
            {
                username: "@john",
                text: "Welcome to V-Tik! 🔥"
            },
            {
                username: "@mary",
                text: "This is amazing!"
            }
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
            {
                username: "@dancer",
                text: "This is fire 🔥🔥"
            }
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
            {
                username: "@uganda",
                text: "Beautiful Uganda 🇺🇬"
            }
        ]
    }
];


/* =========================================================
   GET DOM ELEMENTS
   ========================================================= */

const feed = document.getElementById("feed");

const searchInput =
    document.getElementById("searchInput");

const clearSearch =
    document.getElementById("clearSearch");

const createTop =
    document.getElementById("createTop");

const mobileCreate =
    document.getElementById("mobileCreate");

const notificationBtn =
    document.getElementById("notificationBtn");

const profileButton =
    document.getElementById("profileButton");

const mobileProfile =
    document.getElementById("mobileProfile");

const commentsModal =
    document.getElementById("commentsModal");

const closeComments =
    document.getElementById("closeComments");

const commentsContainer =
    document.getElementById("comments");

const commentForm =
    document.getElementById("commentForm");

const commentInput =
    document.getElementById("commentInput");

const createModal =
    document.getElementById("createModal");

const closeCreate =
    document.getElementById("closeCreate");

const videoPicker =
    document.getElementById("videoPicker");

const preview =
    document.getElementById("preview");

const videoCaption =
    document.getElementById("videoCaption");

const postVideo =
    document.getElementById("postVideo");

const uploadName =
    document.getElementById("uploadName");

const videoViewer =
    document.getElementById("videoViewer");

const viewerClose =
    document.getElementById("viewerClose");

const viewerVideo =
    document.getElementById("viewerVideo");

const toast =
    document.getElementById("toast");


/* =========================================================
   START APPLICATION
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    loadFeed();

    setupSearch();

    setupCreateButtons();

    setupComments();

    setupViewer();

    setupNavigation();

    setupProfileButtons();

    setupNotifications();

    updateProfileButton();

});


/* =========================================================
   LOAD FEED
   ========================================================= */

function loadFeed() {

    try {

        const saved =
            localStorage.getItem("vtik_feed");

        if (saved) {

            const parsed =
                JSON.parse(saved);

            if (
                Array.isArray(parsed) &&
                parsed.length > 0
            ) {
                videos = parsed;
            } else {
                videos =
                    cloneDefaults();
            }

        } else {

            videos =
                cloneDefaults();
        }

    } catch (error) {

        console.error(
            "V-Tik feed loading error:",
            error
        );

        videos =
            cloneDefaults();
    }

    restoreUploadedVideos();

    renderFeed();
}


/* =========================================================
   CLONE DEFAULT VIDEOS
   ========================================================= */

function cloneDefaults() {

    return JSON.parse(
        JSON.stringify(DEFAULT_VIDEOS)
    );
}


/* =========================================================
   SAVE FEED
   ========================================================= */

function saveFeed() {

    try {

        const cleanData =
            videos.map(video => {

                const copy = {
                    ...video
                };

                delete copy.localURL;

                return copy;
            });

        localStorage.setItem(
            "vtik_feed",
            JSON.stringify(cleanData)
        );

    } catch (error) {

        console.error(
            "V-Tik feed saving error:",
            error
        );
    }
}


/* =========================================================
   RENDER FEED
   ========================================================= */

function renderFeed(list = videos) {

    if (!feed) {
        console.error(
            "Element #feed was not found."
        );
        return;
    }

    feed.innerHTML = "";

    if (!list.length) {

        feed.innerHTML = `
            <div class="empty-feed">
                <div class="empty-icon">🔎</div>

                <h2>No videos found</h2>

                <p>
                    Try another search or create
                    a new video.
                </p>

                <button
                    class="create-empty"
                    id="emptyCreateButton"
                >
                    ＋ Create Video
                </button>
            </div>
        `;

        const emptyButton =
            document.getElementById(
                "emptyCreateButton"
            );

        emptyButton?.addEventListener(
            "click",
            openCreateModal
        );

        return;
    }

    list.forEach(video => {

        const card =
            createVideoCard(video);

        feed.appendChild(card);

    });

    setupVideoPlayback();
}


/* =========================================================
   CREATE VIDEO CARD
   ========================================================= */

function createVideoCard(video) {

    const article =
        document.createElement("article");

    article.className = "video-card";

    article.dataset.id =
        video.id;

    const source =
        video.localURL ||
        video.src ||
        "";

    article.innerHTML = `

        <div class="video-wrapper">

            <video
                class="feed-video"
                src="${escapeHTML(source)}"
                loop
                muted
                playsinline
                preload="metadata"
            ></video>


            <div class="video-gradient"></div>


            <div class="video-badge">
                ${escapeHTML(
                    video.badge || "FOR YOU"
                )}
            </div>


            <button
                class="video-sound"
                data-action="sound"
                type="button"
            >
                ${soundEnabled ? "🔊" : "🔇"}
            </button>


            <button
                class="video-expand"
                data-action="fullscreen"
                type="button"
            >
                ⛶
            </button>


            <div class="video-info">

                <div class="creator-row">

                    <div class="creator-avatar">
                        ${escapeHTML(
                            video.avatar || "VT"
                        )}
                    </div>

                    <div class="creator-details">

                        <strong>
                            ${escapeHTML(
                                video.username ||
                                "@vtik_user"
                            )}
                        </strong>

                        <span>
                            ${escapeHTML(
                                video.music ||
                                "Original sound"
                            )}
                        </span>

                    </div>


                    <button
                        class="follow-btn ${
                            video.following
                                ? "following"
                                : ""
                        }"
                        data-action="follow"
                        type="button"
                    >
                        ${
                            video.following
                                ? "Following"
                                : "Follow"
                        }
                    </button>

                </div>


                <p class="caption">
                    ${escapeHTML(
                        video.caption || ""
                    )}
                </p>


                <p class="tags">
                    ${escapeHTML(
                        video.tags || ""
                    )}
                </p>

            </div>


            <div class="video-actions">

                <button
                    class="action-btn ${
                        video.liked
                            ? "active"
                            : ""
                    }"
                    data-action="like"
                    type="button"
                >
                    <span>♥</span>
                    <small>
                        ${formatNumber(
                            video.likes || 0
                        )}
                    </small>
                </button>


                <button
                    class="action-btn"
                    data-action="comment"
                    type="button"
                >
                    <span>💬</span>
                    <small>
                        ${formatNumber(
                            video.commentsCount || 0
                        )}
                    </small>
                </button>


                <button
                    class="action-btn ${
                        video.saved
                            ? "active"
                            : ""
                    }"
                    data-action="save"
                    type="button"
                >
                    <span>🔖</span>
                    <small>
                        ${
                            video.saved
                                ? "Saved"
                                : "Save"
                        }
                    </small>
                </button>


                <button
                    class="action-btn"
                    data-action="share"
                    type="button"
                >
                    <span>↗</span>
                    <small>Share</small>
                </button>

            </div>

        </div>
    `;

    return article;
}


/* =========================================================
   VIDEO PLAYBACK
   ========================================================= */

function setupVideoPlayback() {

    const feedVideos =
        document.querySelectorAll(
            ".feed-video"
        );

    if (!feedVideos.length) {
        return;
    }

    const observer =
        new IntersectionObserver(
            entries => {

                entries.forEach(entry => {

                    const video =
                        entry.target;

                    if (
                        entry.isIntersecting &&
                        entry.intersectionRatio >= 0.6
                    ) {

                        feedVideos.forEach(
                            otherVideo => {

                                if (
                                    otherVideo !==
                                    video
                                ) {
                                    otherVideo.pause();
                                }

                            }
                        );

                        video.muted =
                            !soundEnabled;

                        video.play().catch(
                            () => {}
                        );

                    } else {

                        video.pause();

                    }

                });

            },
            {
                threshold: [0.6]
            }
        );


    feedVideos.forEach(video => {

        observer.observe(video);

        video.addEventListener(
            "click",
            () => {

                openViewer(
                    video.currentSrc ||
                    video.src
                );

            }
        );

    });
}


/* =========================================================
   FEED ACTIONS
   ========================================================= */

feed?.addEventListener(
    "click",
    event => {

        const button =
            event.target.closest(
                "[data-action]"
            );

        if (!button) {
            return;
        }

        const card =
            button.closest(".video-card");

        if (!card) {
            return;
        }

        const id =
            card.dataset.id;

        const action =
            button.dataset.action;

        handleAction(
            action,
            id
        );

    }
);


/* =========================================================
   HANDLE ACTION
   ========================================================= */

function handleAction(
    action,
    id
) {

    const video =
        videos.find(
            item => item.id === id
        );

    if (!video) {
        return;
    }

    if (action === "like") {
        likeVideo(video);
    }

    else if (action === "comment") {
        openComments(video);
    }

    else if (action === "save") {
        saveVideo(video);
    }

    else if (action === "share") {
        shareVideo(video);
    }

    else if (action === "follow") {
        followUser(video);
    }

    else if (action === "sound") {
        toggleSound();
    }

    else if (action === "fullscreen") {
        openViewer(
            video.localURL ||
            video.src
        );
    }
}


/* =========================================================
   LIKE VIDEO
   ========================================================= */

function likeVideo(video) {

    video.liked =
        !video.liked;

    if (video.liked) {

        video.likes =
            (video.likes || 0) + 1;

        showToast(
            "You liked this video ❤️"
        );

    } else {

        video.likes =
            Math.max(
                0,
                (video.likes || 0) - 1
            );

        showToast(
            "Like removed"
        );
    }

    saveFeed();

    renderFeed();

}


/* =========================================================
   SAVE VIDEO
   ========================================================= */

function saveVideo(video) {

    video.saved =
        !video.saved;

    saveFeed();

    renderFeed();

    showToast(
        video.saved
            ? "Video saved 🔖"
            : "Video removed from saved"
    );
}


/* =========================================================
   FOLLOW USER
   ========================================================= */

function followUser(video) {

    video.following =
        !video.following;

    saveFeed();

    renderFeed();

    showToast(
        video.following
            ? `Following ${video.username}`
            : `Unfollowed ${video.username}`
    );
}


/* =========================================================
   SOUND
   ========================================================= */

function toggleSound() {

    soundEnabled =
        !soundEnabled;

    document.querySelectorAll(
        ".feed-video"
    ).forEach(video => {

        video.muted =
            !soundEnabled;

    });

    document.querySelectorAll(
        ".video-sound"
    ).forEach(button => {

        button.textContent =
            soundEnabled
                ? "🔊"
                : "🔇";

    });

    showToast(
        soundEnabled
            ? "Sound turned on 🔊"
            : "Sound turned off 🔇"
    );
}


/* =========================================================
   SEARCH
   ========================================================= */

function setupSearch() {

    searchInput?.addEventListener(
        "input",
        performSearch
    );

    clearSearch?.addEventListener(
        "click",
        () => {

            searchInput.value = "";

            clearSearch.hidden = true;

            renderFeed(videos);

            searchInput.focus();

        }
    );
}


function performSearch() {

    const query =
        searchInput.value
            .trim()
            .toLowerCase();

    if (clearSearch) {
        clearSearch.hidden =
            query.length === 0;
    }

    if (!query) {

        renderFeed(videos);

        return;
    }

    const results =
        videos.filter(video => {

            const text = [
                video.username,
                video.caption,
                video.tags,
                video.music,
                video.badge
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return text.includes(query);

        });

    renderFeed(results);
}


/* =========================================================
   COMMENTS
   ========================================================= */

function setupComments() {

    closeComments?.addEventListener(
        "click",
        closeCommentsWindow
    );

    commentsModal?.addEventListener(
        "click",
        event => {

            if (
                event.target ===
                commentsModal
            ) {
                closeCommentsWindow();
            }

        }
    );

    commentForm?.addEventListener(
        "submit",
        postComment
    );
}


function openComments(video) {

    currentVideoId =
        video.id;

    renderComments(video);

    commentsModal?.classList.add(
        "show"
    );

    setTimeout(() => {
        commentInput?.focus();
    }, 150);
}


function renderComments(video) {

    if (!commentsContainer) {
        return;
    }

    const comments =
        Array.isArray(video.comments)
            ? video.comments
            : [];

    if (!comments.length) {

        commentsContainer.innerHTML = `
            <div class="no-comments">
                <div>💬</div>
                <p>No comments yet.</p>
                <span>Be the first to comment.</span>
            </div>
        `;

        return;
    }

    commentsContainer.innerHTML =
        comments.map(comment => {

            const username =
                comment.username ||
                "@user";

            return `
                <div class="comment">

                    <div class="comment-avatar">
                        ${escapeHTML(
                            username
                                .replace("@", "")
                                .slice(0, 2)
                                .toUpperCase()
                        )}
                    </div>

                    <div class="comment-body">

                        <strong>
                            ${escapeHTML(
                                username
                            )}
                        </strong>

                        <p>
                            ${escapeHTML(
                                comment.text
                            )}
                        </p>

                    </div>

                </div>
            `;

        }).join("");
}


function postComment(event) {

    event.preventDefault();

    if (!commentInput) {
        return;
    }

    const text =
        commentInput.value.trim();

    if (!text) {
        return;
    }

    const video =
        videos.find(
            item =>
                item.id ===
                currentVideoId
        );

    if (!video) {
        return;
    }

    if (!Array.isArray(video.comments)) {
        video.comments = [];
    }

    video.comments.push({

        username:
            getCurrentUsername(),

        text:
            text

    });

    video.commentsCount =
        video.comments.length;

    commentInput.value = "";

    saveFeed();

    renderComments(video);

    renderFeed();

    showToast(
        "Comment posted 💬"
    );
}


function closeCommentsWindow() {

    commentsModal?.classList.remove(
        "show"
    );

    currentVideoId = null;
}


/* =========================================================
   SHARE
   ========================================================= */

async function shareVideo(video) {

    const shareText =
        `${video.caption || "Check this V-Tik video"} ${video.tags || ""}`;

    try {

        if (
            navigator.share
        ) {

            await navigator.share({

                title:
                    "V-Tik Video",

                text:
                    shareText,

                url:
                    window.location.href

            });

            return;
        }

        if (
            navigator.clipboard
        ) {

            await navigator.clipboard.writeText(
                `${shareText}\n${window.location.href}`
            );

            showToast(
                "Video link copied 🔗"
            );

            return;
        }

        showToast(
            "Sharing is not available."
        );

    } catch (error) {

        if (
            error.name !==
            "AbortError"
        ) {

            console.error(
                "Share error:",
                error
            );

            showToast(
                "Could not share video."
            );
        }
    }
}


/* =========================================================
   CREATE / UPLOAD
   ========================================================= */

function setupCreateButtons() {

    createTop?.addEventListener(
        "click",
        openCreateModal
    );

    mobileCreate?.addEventListener(
        "click",
        openCreateModal
    );

    closeCreate?.addEventListener(
        "click",
        closeCreateModal
    );

    createModal?.addEventListener(
        "click",
        event => {

            if (
                event.target ===
                createModal
            ) {
                closeCreateModal();
            }

        }
    );

    videoPicker?.addEventListener(
        "change",
        selectVideoFile
    );

    postVideo?.addEventListener(
        "click",
        uploadVideo
    );
}


function openCreateModal() {

    createModal?.classList.add(
        "show"
    );
}


function closeCreateModal() {

    createModal?.classList.remove(
        "show"
    );

    if (selectedVideoURL) {

        URL.revokeObjectURL(
            selectedVideoURL
        );

        selectedVideoURL = null;
    }

    selectedVideoFile = null;

    if (videoPicker) {
        videoPicker.value = "";
    }

    if (preview) {

        preview.pause();

        preview.removeAttribute(
            "src"
        );

        preview.load();

        preview.hidden = true;
    }

    if (videoCaption) {
        videoCaption.value = "";
    }

    if (uploadName) {
        uploadName.textContent = "";
    }

    if (postVideo) {
        postVideo.disabled = true;
    }
}


/* =========================================================
   SELECT VIDEO
   ========================================================= */

function selectVideoFile(event) {

    const file =
        event.target.files?.[0];

    if (!file) {
        return;
    }

    if (
        !file.type.startsWith(
            "video/"
        )
    ) {

        showToast(
            "Please choose a video file."
        );

        return;
    }

    selectedVideoFile =
        file;

    if (selectedVideoURL) {

        URL.revokeObjectURL(
            selectedVideoURL
        );
    }

    selectedVideoURL =
        URL.createObjectURL(
            file
        );

    if (preview) {

        preview.src =
            selectedVideoURL;

        preview.hidden = false;

        preview.load();

    }

    if (uploadName) {

        uploadName.textContent =
            `${file.name} • ${formatFileSize(file.size)}`;

    }

    if (postVideo) {
        postVideo.disabled = false;
    }
}


/* =========================================================
   UPLOAD VIDEO
   ========================================================= */

async function uploadVideo() {

    if (!selectedVideoFile) {

        showToast(
            "Please choose a video first."
        );

        return;
    }

    const caption =
        videoCaption?.value.trim() ||
        "My new V-Tik video 🎬";


    try {

        const fileId =
            await saveVideoToDatabase(
                selectedVideoFile
            );

        const newVideo = {

            id:
                "user-" +
                Date.now(),

            src:
                "",

            localFileId:
                fileId,

            localURL:
                selectedVideoURL,

            username:
                getCurrentUsername(),

            avatar:
                getCurrentAvatar(),

            caption:
                caption,

            tags:
                "#VTik #NewVideo",

            music:
                "♫ Original sound",

            badge:
                "NEW",

            likes:
                0,

            commentsCount:
                0,

            comments:
                [],

            liked:
                false,

            saved:
                false,

            following:
                false

        };


        videos.unshift(
            newVideo
        );

        saveFeed();

        renderFeed();

        closeCreateModal();

        showToast(
            "Video posted successfully 🎉"
        );

    } catch (error) {

        console.error(
            "Video upload error:",
            error
        );

        showToast(
            "Could not save your video."
        );
    }
}


/* =========================================================
   INDEXED DATABASE
   ========================================================= */

const DATABASE_NAME =
    "VTikDatabase";

const DATABASE_VERSION =
    1;

const VIDEO_STORE =
    "videos";


function openDatabase() {

    return new Promise(
        (resolve, reject) => {

            if (
                !window.indexedDB
            ) {

                reject(
                    new Error(
                        "IndexedDB is not supported."
                    )
                );

                return;
            }

            const request =
                indexedDB.open(
                    DATABASE_NAME,
                    DATABASE_VERSION
                );


            request.onupgradeneeded =
                event => {

                    const database =
                        event.target.result;

                    if (
                        !database.objectStoreNames.contains(
                            VIDEO_STORE
                        )
                    ) {

                        database.createObjectStore(
                            VIDEO_STORE,
                            {
                                keyPath: "id"
                            }
                        );

                    }
                };


            request.onsuccess =
                () => {

                    resolve(
                        request.result
                    );

                };


            request.onerror =
                () => {

                    reject(
                        request.error
                    );

                };

        }
    );
}


/* =========================================================
   SAVE VIDEO FILE
   ========================================================= */

async function saveVideoToDatabase(
    file
) {

    const database =
        await openDatabase();

    return new Promise(
        (resolve, reject) => {

            const id =
                "file-" +
                Date.now() +
                "-" +
                Math.random()
                    .toString(36)
                    .slice(2);


            const transaction =
                database.transaction(
                    VIDEO_STORE,
                    "readwrite"
                );


            const store =
                transaction.objectStore(
                    VIDEO_STORE
                );


            store.put({

                id:
                    id,

                file:
                    file

            });


            transaction.oncomplete =
                () => {

                    database.close();

                    resolve(id);

                };


            transaction.onerror =
                () => {

                    database.close();

                    reject(
                        transaction.error
                    );

                };

        }
    );
}


/* =========================================================
   GET STORED VIDEO
   ========================================================= */

async function getStoredVideo(
    id
) {

    const database =
        await openDatabase();

    return new Promise(
        (resolve, reject) => {

            const transaction =
                database.transaction(
                    VIDEO_STORE,
                    "readonly"
                );

            const store =
                transaction.objectStore(
                    VIDEO_STORE
                );

            const request =
                store.get(id);


            request.onsuccess =
                () => {

                    const result =
                        request.result;

                    database.close();

                    resolve(
                        result
                            ? result.file
                            : null
                    );

                };


            request.onerror =
                () => {

                    database.close();

                    reject(
                        request.error
                    );

                };

        }
    );
}


/* =========================================================
   RESTORE UPLOADED VIDEOS
   ========================================================= */

async function restoreUploadedVideos() {

    for (
        const video of videos
    ) {

        if (
            !video.localFileId
        ) {
            continue;
        }

        try {

            const file =
                await getStoredVideo(
                    video.localFileId
                );

            if (file) {

                video.localURL =
                    URL.createObjectURL(
                        file
                    );
            }

        } catch (error) {

            console.warn(
                "Could not restore uploaded video:",
                error
            );
        }
    }

    renderFeed();
}


/* =========================================================
   FULLSCREEN VIEWER
   ========================================================= */

function setupViewer() {

    viewerClose?.addEventListener(
        "click",
        closeViewer
    );

    videoViewer?.addEventListener(
        "click",
        event => {

            if (
                event.target ===
                videoViewer
            ) {

                closeViewer();

            }

        }
    );
}


function openViewer(
    source
) {

    if (
        !videoViewer ||
        !viewerVideo ||
        !source
    ) {
        return;
    }

    viewerVideo.src =
        source;

    viewerVideo.muted =
        !soundEnabled;

    videoViewer.classList.add(
        "show"
    );

    viewerVideo.play().catch(
        () => {}
    );
}


function closeViewer() {

    if (
        !videoViewer ||
        !viewerVideo
    ) {
        return;
    }

    viewerVideo.pause();

    viewerVideo.removeAttribute(
        "src"
    );

    viewerVideo.load();

    videoViewer.classList.remove(
        "show"
    );
}


/* =========================================================
   NAVIGATION
   ========================================================= */

function setupNavigation() {

    document.querySelectorAll(
        "[data-section]"
    ).forEach(button => {

        button.addEventListener(
            "click",
            () => {

                const section =
                    button.dataset.section;

                changeSection(
                    section
                );

                updateActiveNavigation(
                    section
                );

            }
        );

    });
}


function updateActiveNavigation(
    section
) {

    document.querySelectorAll(
        "[data-section]"
    ).forEach(button => {

        button.classList.toggle(
            "active",
            button.dataset.section ===
                section
        );

    });
}


function changeSection(
    section
) {

    if (
        section === "home"
    ) {

        renderFeed(videos);

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });

        return;
    }


    if (
        section === "liked"
    ) {

        renderFeed(
            videos.filter(
                video => video.liked
            )
        );

        showToast(
            "Showing liked videos ❤️"
        );

        return;
    }


    if (
        section === "saved"
    ) {

        renderFeed(
            videos.filter(
                video => video.saved
            )
        );

        showToast(
            "Showing saved videos 🔖"
        );

        return;
    }


    if (
        section === "following"
    ) {

        renderFeed(
            videos.filter(
                video => video.following
            )
        );

        showToast(
            "Showing videos from followed creators"
        );

        return;
    }


    if (
        section === "trending"
    ) {

        const trending =
            [...videos].sort(
                (a, b) =>
                    (b.likes || 0) -
                    (a.likes || 0)
            );

        renderFeed(
            trending
        );

        showToast(
            "Trending videos 🔥"
        );

        return;
    }


    if (
        section === "discover"
    ) {

        renderFeed(
            [...videos].reverse()
        );

        showToast(
            "Discover new videos 🔎"
        );

        return;
    }


    if (
        section === "music"
    ) {

        const musicVideos =
            videos.filter(video => {

                const text =
                    `${video.tags || ""} ${video.music || ""}`
                        .toLowerCase();

                return (
                    text.includes("music") ||
                    text.includes("sound") ||
                    text.includes("song")
                );

            });

        renderFeed(
            musicVideos
        );

        showToast(
            "Music videos 🎵"
        );

        return;
    }


    if (
        section === "gaming"
    ) {

        const gamingVideos =
            videos.filter(video =>
                `${video.tags || ""} ${video.caption || ""}`
                    .toLowerCase()
                    .includes("gaming")
            );

        renderFeed(
            gamingVideos
        );

        showToast(
            "Gaming videos 🎮"
        );

        return;
    }


    if (
        section === "challenges"
    ) {

        const challenges =
            videos.filter(video =>
                `${video.tags || ""} ${video.caption || ""}`
                    .toLowerCase()
                    .includes("challenge")
            );

        renderFeed(
            challenges
        );

        showToast(
            "Challenges 🏆"
        );

        return;
    }


    if (
        section === "messages"
    ) {

        showToast(
            "Messages are coming soon 💬"
        );

        return;
    }
}


/* =========================================================
   PROFILE
   ========================================================= */

function setupProfileButtons() {

    profileButton?.addEventListener(
        "click",
        openProfile
    );

    mobileProfile?.addEventListener(
        "click",
        openProfile
    );
}


function openProfile() {

    /*
       If your profile page is called
       accounts.html, change this to:

       window.location.href = "accounts.html";
    */

    window.location.href =
        "account.html";
}


function getCurrentUsername() {

    return (
        localStorage.getItem(
            "vtik_username"
        ) ||

        localStorage.getItem(
            "vtik_current_user"
        ) ||

        "vtik_user"
    );
}


function getCurrentAvatar() {

    const name =
        localStorage.getItem(
            "vtik_name"
        ) ||
        "VT";

    const letters =
        name
            .trim()
            .split(/\s+/)
            .map(
                word => word[0]
            )
            .join("")
            .toUpperCase();

    return (
        letters.slice(0, 2) ||
        "VT"
    );
}


function updateProfileButton() {

    const avatar =
        getCurrentAvatar();

    if (profileButton) {

        profileButton.textContent =
            avatar;

    }
}


/* =========================================================
   NOTIFICATIONS
   ========================================================= */

function setupNotifications() {

    notificationBtn?.addEventListener(
        "click",
        () => {

            showToast(
                "No new notifications 🔔"
            );

        }
    );
}


/* =========================================================
   TOAST
   ========================================================= */

function showToast(
    message
) {

    if (!toast) {
        return;
    }

    toast.textContent =
        message;

    toast.classList.add(
        "show"
    );

    clearTimeout(
        toastTimeout
    );

    toastTimeout =
        setTimeout(
            () => {

                toast.classList.remove(
                    "show"
                );

            },
            2500
        );
}


/* =========================================================
   FORMAT NUMBERS
   ========================================================= */

function formatNumber(
    value
) {

    const number =
        Number(value) || 0;

    if (
        number >= 1000000
    ) {

        return (
            (number / 1000000)
                .toFixed(1)
                .replace(".0", "") +
            "M"
        );

    }

    if (
        number >= 1000
    ) {

        return (
            (number / 1000)
                .toFixed(1)
                .replace(".0", "") +
            "K"
        );

    }

    return String(
        number
    );
}


/* =========================================================
   FORMAT FILE SIZE
   ========================================================= */

function formatFileSize(
    bytes
) {

    if (!bytes) {
        return "0 KB";
    }

    const megabytes =
        bytes /
        (1024 * 1024);

    if (
        megabytes >= 1
    ) {

        return (
            megabytes.toFixed(1) +
            " MB"
        );

    }

    return (
        Math.max(
            1,
            Math.round(
                bytes / 1024
            )
        ) +
        " KB"
    );
}


/* =========================================================
   ESCAPE HTML
   ========================================================= */

function escapeHTML(
    value
) {

    return String(
        value ?? ""
    )
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );
}


/* =========================================================
   KEYBOARD CONTROLS
   ========================================================= */

document.addEventListener(
    "keydown",
    event => {

        if (
            event.key ===
            "Escape"
        ) {

            closeViewer();

            closeCommentsWindow();

            closeCreateModal();

        }


        if (
            event.key === "/" &&
            document.activeElement !==
                searchInput
        ) {

            event.preventDefault();

            searchInput?.focus();

        }

    }
);


/* =========================================================
   CLEANUP
   ========================================================= */

window.addEventListener(
    "beforeunload",
    () => {

        videos.forEach(video => {

            if (
                video.localURL
            ) {

                URL.revokeObjectURL(
                    video.localURL
                );

            }

        });

        if (
            selectedVideoURL
        ) {

            URL.revokeObjectURL(
                selectedVideoURL
            );

        }

    }
);
```
