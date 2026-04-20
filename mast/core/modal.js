(function () {
  "use strict";

  // Early exit if no dialogs exist on the page
  if (!document.querySelector("dialog")) {
    return;
  }

  // Initialize modal functionality
  function initModals() {
    try {
      // Get all dialog elements
      const dialogs = document.querySelectorAll("dialog");

      // Early exit if no dialogs found
      if (dialogs.length === 0) {
        return;
      }

      // Use event delegation for better performance
      document.addEventListener("click", handleModalClicks);

      // Setup individual dialog listeners only for click-outside functionality
      dialogs.forEach(setupDialogClickOutside);

      // Handle auto-open modals with cooldown support
      dialogs.forEach(handleAutoOpenModal);
    } catch (error) {
      console.warn("Modal initialization failed:", error);
    }
  }

  // Handle all modal-related clicks using event delegation
  function handleModalClicks(e) {
    const target = e.target;

    // Handle show modal buttons (buttons that immediately follow dialogs)
    if (target.closest("dialog + button")) {
      e.preventDefault();
      const dialog = target.previousElementSibling;
      if (dialog && dialog.tagName === "DIALOG") {
        dialog.showModal();
      }
      return;
    }

    // Handle close modal buttons
    if (target.closest('dialog button.modal_close-button, dialog button[data-modal="close"]')) {
      e.preventDefault();
      const dialog = target.closest("dialog");
      if (dialog) {
        dialog.close();
      }
      return;
    }
  }

  // Setup click-outside-to-close functionality for each dialog
  function setupDialogClickOutside(dialog) {
    dialog.addEventListener("click", function (e) {
      // Only close if clicking on the dialog backdrop (not its content)
      if (e.target === dialog) {
        dialog.close();
      }
    });

    // Track when modal is closed to update localStorage if cooldown is enabled
    dialog.addEventListener("close", function () {
      handleModalClose(dialog);
    });
  }

  // Handle auto-open modal functionality with cooldown support
  function handleAutoOpenModal(dialog) {
    const shouldOpenOnLoad = dialog.dataset.modalOpenOnLoad === "true";

    if (!shouldOpenOnLoad) {
      return;
    }

    const cooldownDays = parseInt(dialog.dataset.modalCooldownDays, 10) || 0;
    const modalId = getModalId(dialog);

    // Exit if modal doesn't have a valid parent ID
    if (!modalId) {
      return;
    }

    // Check if modal is in cooldown period
    if (cooldownDays > 0 && isInCooldown(modalId)) {
      return;
    }

    // Open the modal
    dialog.showModal();
  }

  // Handle modal close event and store cooldown timestamp
  function handleModalClose(dialog) {
    const cooldownDays = parseInt(dialog.dataset.modalCooldownDays, 10);

    if (cooldownDays > 0) {
      const modalId = getModalId(dialog);
      if (modalId) {
        storeCooldownTimestamp(modalId, cooldownDays);
      }
    }
  }

  // Get the modal ID from the parent element
  function getModalId(dialog) {
    const parent = dialog.parentElement;

    if (!parent || !parent.id) {
      console.log("Modal component must have ID set for cooldown to work.");
      return null;
    }

    return parent.id;
  }

  // Check if a modal is currently in cooldown period
  function isInCooldown(modalId) {
    try {
      const storageKey = `modal-cooldown-${modalId}`;
      const cooldownUntil = localStorage.getItem(storageKey);

      if (!cooldownUntil) {
        return false;
      }

      const now = Date.now();
      const cooldownTime = parseInt(cooldownUntil, 10);

      // If cooldown has expired, remove it from storage
      if (now > cooldownTime) {
        localStorage.removeItem(storageKey);
        return false;
      }

      return true;
    } catch (error) {
      console.warn("Error checking modal cooldown:", error);
      return false;
    }
  }

  // Store cooldown timestamp in localStorage
  function storeCooldownTimestamp(modalId, days) {
    try {
      const storageKey = `modal-cooldown-${modalId}`;
      const now = Date.now();
      const cooldownDuration = days * 24 * 60 * 60 * 1000; // Convert days to milliseconds
      const cooldownUntil = now + cooldownDuration;

      localStorage.setItem(storageKey, cooldownUntil.toString());
    } catch (error) {
      console.warn("Error storing modal cooldown:", error);
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initModals);
  } else {
    initModals();
  }
})();
