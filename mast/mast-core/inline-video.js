class VideoLibrary {
    constructor(options = {}) {
      this.options = {
        rootMargin: options.rootMargin || "100px",
        threshold: options.threshold || 0,
        scrollTriggerThreshold: options.scrollTriggerThreshold || 0.5,
        debug: options.debug || false,
        ...options,
      };

      this.prefersReducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      this.videoObserver = null;
      this.scrollObservers = new Map();
      this.pictureElementCache = new WeakMap();
      this.eventListeners = new WeakMap();
      this.resizeHandler = null;
      this.resizeTimeout = null;

      this.init();
    }
  
    init() {
      // Early exit if no videos are present - optimizes performance for pages without videos
      const videos = document.querySelectorAll("video[data-video]");
      if (videos.length === 0) {
        return;
      }
  
      if (this.prefersReducedMotion) {
        console.log("User prefers reduced motion. Videos will not auto-play.");
      }
  
      // Remove desktop-only videos on small screens
      this.removeDesktopOnlyVideos();
  
      // Initialize video functionality
      this.setupLazyLoading();
      this.setupVideoControls();
      this.setupHoverPlay();
      // Only add resize listener if desktop-only videos are present
      const desktopOnlyVideos = document.querySelectorAll(
        'video[data-video-desktop-only="true"]'
      );
      if (desktopOnlyVideos.length > 0) {
        // Throttled resize handler for better performance
        this.resizeHandler = () => {
          if (this.resizeTimeout) {
            clearTimeout(this.resizeTimeout);
          }
          this.resizeTimeout = setTimeout(() => {
            this.removeDesktopOnlyVideos();
          }, 150);
        };
        window.addEventListener("resize", this.resizeHandler);
      }
    }

    /**
     * Get the component container for a given video
     * @param {HTMLVideoElement} video
     * @returns {HTMLElement|null}
     */
    getComponentContainer(video) {
      return (
        video.closest('[data-video="component"]') ||
        video.parentElement ||
        null
      );
    }

    /**
     * Remove desktop-only videos on small screens and hide their controls
     */
    removeDesktopOnlyVideos() {
      // Query once instead of twice for better performance
      const desktopOnlyVideos = document.querySelectorAll('video[data-video-desktop-only="true"]');
      const isSmallScreen = window.innerWidth <= 991;

      desktopOnlyVideos.forEach((video) => {
        const videoContainer = this.getComponentContainer(video);
        const playbackWrapper = videoContainer
          ? videoContainer.querySelector('[data-video-playback="wrapper"]')
          : null;

        if (isSmallScreen) {
          // Hide the video but show the picture
          video.style.display = "none";
          this.showPictureElement(video);

          // Hide associated playback controls wrapper
          if (playbackWrapper) {
            playbackWrapper.style.display = "none";
            playbackWrapper.style.visibility = "hidden";
            playbackWrapper.setAttribute("aria-hidden", "true");
          }
        } else {
          // Show videos and controls on larger screens
          video.style.display = "";
          this.hidePictureElement(video);

          // Show associated playback controls wrapper
          if (playbackWrapper) {
            playbackWrapper.style.display = "";
            playbackWrapper.style.visibility = "";
            playbackWrapper.setAttribute("aria-hidden", "false");
          }
        }
      });
    }
  
    /**
     * Setup lazy loading for all videos with data-video attribute
     */
    setupLazyLoading() {
      const videos = document.querySelectorAll("video[data-video]");
  
      if (videos.length === 0) return;
  
      const observerOptions = {
        root: null,
        rootMargin: this.options.rootMargin,
        threshold: this.options.threshold,
      };
  
      // Lazy load videos when they intersect
      const videoObserverCallback = (entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const video = entry.target;
            this.lazyLoadVideo(video)
              .then(() => observer.unobserve(video))
              .catch(console.error);
          }
        });
      };
  
      this.videoObserver = new IntersectionObserver(
        videoObserverCallback,
        observerOptions
      );
  
      // Start observing videos for lazy loading and handle autoplay behavior
      videos.forEach((video) => {
        const scrollInPlay =
          video.getAttribute("data-video-scroll-in-play") === "true";
        const hoverPlay = video.getAttribute("data-video-hover") === "true";

        // Always observe for lazy loading
        this.videoObserver.observe(video);

        if (hoverPlay && scrollInPlay) {
          // For hover + scroll-in-play videos: lazy load and pause when in view, ready for hover
          this.setupScrollInPlayForHover(video);
        } else if (hoverPlay) {
          // For hover-only videos: just lazy load, no autoplay behavior
          // Logic handled in setupHoverPlay
        } else if (this.prefersReducedMotion) {
          video.pause();
        } else if (scrollInPlay) {
          // For scroll-in-play videos, observe both for lazy loading and scroll trigger
          this.setupScrollInPlay(video);
        } else {
          // For regular videos, just observe for lazy loading and autoplay when loaded
          this.setupAutoplay(video);
        }
      });
    }
  
    /**
     * Lazy load a video by setting the src from data-src
     * @param {HTMLVideoElement} video - The video element to load
     * @returns {Promise} - Resolves when video can play through
     */
    lazyLoadVideo(video) {
      return new Promise((resolve, reject) => {
        const source = video.querySelector("source[data-src]");
        if (source && !source.src) {
          source.src = source.getAttribute("data-src");
          video.load();
  
          video.addEventListener("canplaythrough", function onCanPlayThrough() {
            video.removeEventListener("canplaythrough", onCanPlayThrough);
            resolve();
          });
  
          video.addEventListener("error", function onError() {
            video.removeEventListener("error", onError);
            reject(new Error(`Error loading video: ${source.src}`));
          });
        } else {
          resolve(); // Already loaded or source missing
        }
      });
    }

    /**
     * Show the picture element for a video
     * @param {HTMLVideoElement} video - The video element
     */
    showPictureElement(video) {
      const pictureElement = this.findPictureElement(video);
      if (pictureElement) {
        pictureElement.style.display = "block";
      }
    }

    /**
     * Hide the picture element for a video
     * @param {HTMLVideoElement} video - The video element
     */
    hidePictureElement(video) {
      const pictureElement = this.findPictureElement(video);
      if (pictureElement) {
        pictureElement.style.display = "none";
      }
    }

    /**
     * Find the picture element associated with a video
     * @param {HTMLVideoElement} video - The video element
     * @returns {HTMLElement|null} - The picture element or null if not found
     */
    findPictureElement(video) {
      // Check cache first for performance
      if (this.pictureElementCache.has(video)) {
        return this.pictureElementCache.get(video);
      }

      let pictureElement = null;

      // First, check previous siblings (most common case)
      let sibling = video.previousElementSibling;
      while (sibling) {
        if (sibling.tagName === "PICTURE" || sibling.tagName === "IMG") {
          pictureElement = sibling;
          break;
        }
        sibling = sibling.previousElementSibling;
      }

      // Fallback: search within the component container
      if (!pictureElement) {
        const container = this.getComponentContainer(video);
        if (container) {
          pictureElement = container.querySelector('picture, img');
        }
      }

      // Cache the result (WeakMap allows garbage collection when video is removed)
      this.pictureElementCache.set(video, pictureElement);

      return pictureElement;
    }

    /**
     * Setup play/pause button controls for videos
     */
    setupVideoControls() {
      const videos = document.querySelectorAll("video[data-video]");
  
      videos.forEach((video) => {
        this.handlePlaybackButtons(video);
      });
    }
  
    /**
     * Setup hover-to-play functionality for videos with data-video-hover="true"
     */
    setupHoverPlay() {
      const hoverVideos = document.querySelectorAll(
        'video[data-video-hover="true"]'
      );
  
      hoverVideos.forEach((video) => {
        const container = this.getComponentContainer(video);
        const trigger = container || video;
        let hasPlayedOnce = false;

        if (trigger) {
          // Ensure poster is visible initially for hover videos
          this.showPictureElement(video);

          // Make the playback button inaccessible since hover is the primary interaction.
          if (container) {
            const playbackButton = container.querySelector('[data-video-playback="button"]');
            if (playbackButton) {
              playbackButton.setAttribute("aria-hidden", "true");
              playbackButton.setAttribute("tabindex", "-1");
            }
          }

          // On mouse enter, hide picture, lazy load and play
          const mouseEnterHandler = async () => {
            if (this.prefersReducedMotion) return;
            try {
              this.hidePictureElement(video);
              await this.lazyLoadVideo(video);
              // Only reset to beginning on first play
              if (!hasPlayedOnce) {
                video.currentTime = 0;
                hasPlayedOnce = true;
              }
              video.play();
            } catch (error) {
              console.error('Error playing hover video:', error);
            }
          };

          // On mouse leave, pause video (keep current frame visible)
          const mouseLeaveHandler = () => {
            video.pause();
          };

          trigger.addEventListener("mouseenter", mouseEnterHandler);
          trigger.addEventListener("mouseleave", mouseLeaveHandler);

          // Store listeners for cleanup
          if (!this.eventListeners.has(video)) {
            this.eventListeners.set(video, []);
          }
          this.eventListeners.get(video).push(
            { element: trigger, type: "mouseenter", handler: mouseEnterHandler },
            { element: trigger, type: "mouseleave", handler: mouseLeaveHandler }
          );
        }
      });
    }
    /**
     * Setup autoplay for videos that should play immediately when loaded
     * @param {HTMLVideoElement} video - The video element
     */
    setupAutoplay(video) {
      video.addEventListener("canplaythrough", () => {
        if (!this.prefersReducedMotion) {
          this.hidePictureElement(video);
          video.play().catch(console.error);
        }
      });
    }
  
    /**
     * Setup scroll-in-play functionality for a video
     * @param {HTMLVideoElement} video - The video element
     */
    setupScrollInPlay(video) {
      let hasPlayedOnce = false;

      const observer = new IntersectionObserver(
        (entries) => {
          // Process entries without async forEach for better performance
          for (const entry of entries) {
            if (entry.isIntersecting) {
              // Handle lazy loading and playback
              this.lazyLoadVideo(video)
                .then(() => {
                  // If reduced motion is preferred, don't play the video
                  if (!this.prefersReducedMotion) {
                    this.hidePictureElement(video);
                    // Only reset to beginning on first play
                    if (!hasPlayedOnce) {
                      video.currentTime = 0;
                      hasPlayedOnce = true;
                    }
                    video.play();
                  }
                })
                .catch(console.error);
            }
            // On scroll out, pause the video (keep current frame visible)
            else {
              video.pause();
            }
          }
        },
        {
          threshold: this.options.scrollTriggerThreshold,
        }
      );

      observer.observe(video);
      this.scrollObservers.set(video, observer);
    }

    /**
     * Setup scroll-in-play functionality for hover videos (lazy load and pause when in view)
     * @param {HTMLVideoElement} video - The video element
     */
    setupScrollInPlayForHover(video) {
      const observer = new IntersectionObserver(
        (entries) => {
          // Process entries without async forEach for better performance
          for (const entry of entries) {
            if (entry.isIntersecting) {
              // Handle lazy loading
              this.lazyLoadVideo(video)
                .then(() => {
                  // Pause the video so it's ready for hover play
                  video.pause();
                  // Ensure poster is visible
                  this.showPictureElement(video);
                })
                .catch(console.error);
            }
          }
        },
        {
          threshold: this.options.scrollTriggerThreshold,
        }
      );

      observer.observe(video);
      this.scrollObservers.set(video, observer);
    }

    /**
     * Handle play/pause buttons for a video
     * @param {HTMLVideoElement} video - The video element
     */
    handlePlaybackButtons(video) {
      const container = this.getComponentContainer(video);
      if (!container) return;

      // Find single playback button within the component container
      const playbackButton = container.querySelector('[data-video-playback="button"]');

      if (!playbackButton) return;

      // Find play and pause icon spans within the button
      const playIcon = playbackButton.querySelector('[data-video-playback="play"]');
      const pauseIcon = playbackButton.querySelector('[data-video-playback="pause"]');

      if (!playIcon || !pauseIcon) return;

      // Helper function to toggle icon visibility and aria-label
      const toggleButtonState = (isPlaying) => {
        if (isPlaying) {
          // Hide play icon, show pause icon
          playIcon.style.display = "none";
          playIcon.style.visibility = "hidden";
          playIcon.setAttribute("aria-hidden", "true");

          pauseIcon.style.display = "flex";
          pauseIcon.style.visibility = "visible";
          pauseIcon.setAttribute("aria-hidden", "false");

          // Update button aria-label to indicate current action
          playbackButton.setAttribute("aria-label", "Pause video");
        } else {
          // Show play icon, hide pause icon
          playIcon.style.display = "flex";
          playIcon.style.visibility = "visible";
          playIcon.setAttribute("aria-hidden", "false");

          pauseIcon.style.display = "none";
          pauseIcon.style.visibility = "hidden";
          pauseIcon.setAttribute("aria-hidden", "true");

          // Update button aria-label to indicate current action
          playbackButton.setAttribute("aria-label", "Play video");
        }
      };

      // Set initial button state
      toggleButtonState(!video.paused);

      // Event listener for playback button
      const clickHandler = async (event) => {
        event.stopPropagation();

        if (video.paused) {
          // Video is paused, play it
          try {
            await this.lazyLoadVideo(video);
            this.hidePictureElement(video);
            video.play();
            toggleButtonState(true);
          } catch (error) {
            console.error(error);
          }
        } else {
          // Video is playing, pause it
          video.pause();
          toggleButtonState(false);
        }
      };

      // Sync button state with video play/pause events
      const playHandler = () => toggleButtonState(true);
      const pauseHandler = () => toggleButtonState(false);

      playbackButton.addEventListener("click", clickHandler);
      video.addEventListener("play", playHandler);
      video.addEventListener("pause", pauseHandler);

      // Store listeners for cleanup
      if (!this.eventListeners.has(video)) {
        this.eventListeners.set(video, []);
      }
      this.eventListeners.get(video).push(
        { element: playbackButton, type: "click", handler: clickHandler },
        { element: video, type: "play", handler: playHandler },
        { element: video, type: "pause", handler: pauseHandler }
      );
    }
  
    /**
     * Play a specific video by its data-video attribute
     * @param {string} videoId - The data-video attribute value
     */
    async playVideo(videoId) {
      const video = document.querySelector(`video[data-video="${videoId}"]`);
      if (!video) {
        console.warn(`Video with id "${videoId}" not found`);
        return;
      }
  
      try {
        await this.lazyLoadVideo(video);
        if (!this.prefersReducedMotion) {
          this.hidePictureElement(video);
          video.currentTime = 0;
          video.play();
        }
      } catch (error) {
        console.error(`Error playing video ${videoId}:`, error);
      }
    }
  
    /**
     * Pause a specific video by its data-video attribute
     * @param {string} videoId - The data-video attribute value
     */
    pauseVideo(videoId) {
      const video = document.querySelector(`video[data-video="${videoId}"]`);
      if (!video) {
        console.warn(`Video with id "${videoId}" not found`);
        return;
      }
  
      video.pause();
    }
  
    /**
     * Pause all videos
     */
    pauseAllVideos() {
      document.querySelectorAll("video[data-video]").forEach((video) => {
        video.pause();
      });
    }
  
    /**
     * Destroy the video library and clean up observers
     */
    destroy() {
      // Disconnect IntersectionObservers
      if (this.videoObserver) {
        this.videoObserver.disconnect();
      }

      this.scrollObservers.forEach((observer) => {
        observer.disconnect();
      });
      this.scrollObservers.clear();

      // Remove all event listeners
      this.eventListeners.forEach((listeners) => {
        listeners.forEach(({ element, type, handler }) => {
          element.removeEventListener(type, handler);
        });
      });
      this.eventListeners = new WeakMap();

      // Clear resize handler and timeout
      if (this.resizeHandler) {
        window.removeEventListener("resize", this.resizeHandler);
        this.resizeHandler = null;
      }

      if (this.resizeTimeout) {
        clearTimeout(this.resizeTimeout);
        this.resizeTimeout = null;
      }

      // Clear caches
      this.pictureElementCache = new WeakMap();
    }
  
    /**
     * Reinitialize the video library (useful after DOM changes)
     */
    reinitialize() {
      this.destroy();
      this.init();
    }
}
  
  // Auto-initialize if DOM is already loaded and videos are present
  function initializeVideoLibrary() {
    // Quick check before instantiating to avoid unnecessary object creation
    if (document.querySelectorAll("video[data-video]").length > 0) {
      window.videoLibrary = new VideoLibrary();
    } else if (window.VideoLibraryConfig?.debug) {
      console.log(
        "VideoLibrary: No videos detected, skipping auto-initialization."
      );
    }
  }
  
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeVideoLibrary);
  } else {
    initializeVideoLibrary();
  }
  
  // Export for module usage
  if (typeof module !== "undefined" && module.exports) {
    module.exports = VideoLibrary;
  }
