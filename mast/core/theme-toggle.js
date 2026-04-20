(function () {
    const docEl = document.documentElement;
    const savedTheme = localStorage.getItem("savedTheme");
    const prefersColorScheme = window.matchMedia("(prefers-color-scheme: dark)");

    // Apply mode classes globally
    function applyMode(isLight) {
      docEl.classList.toggle("u-mode-light", isLight);
      docEl.classList.toggle("u-mode-dark", !isLight);
    }

    // Update label visibility for a specific toggle instance
    function updateLabels(isLight, darkLabel, lightLabel) {
      if (darkLabel && lightLabel) {
        darkLabel.style.display = isLight ? "none" : "block";
        lightLabel.style.display = isLight ? "block" : "none";
      }
    }

    // Determine initial mode from saved preference or OS
    let isLight = savedTheme !== null ? savedTheme === "light" : !prefersColorScheme.matches;

    // Apply mode immediately to prevent flash
    applyMode(isLight);

    // Set up checkbox toggles and OS preference listener
    window.addEventListener("DOMContentLoaded", function () {
      const checkboxes = document.querySelectorAll('[data-theme-toggle="checkbox"]');

      // Cache label references for each checkbox to avoid repeated queries
      const toggleInstances = Array.from(checkboxes).map(function (checkbox) {
        return {
          checkbox: checkbox,
          darkLabel: checkbox.parentElement.querySelector('[data-theme-toggle="dark-label"]'),
          lightLabel: checkbox.parentElement.querySelector('[data-theme-toggle="light-label"]')
        };
      });

      // Shared function to update all toggle instances
      function syncAllToggles(isLight) {
        toggleInstances.forEach(function (instance) {
          instance.checkbox.checked = isLight;
          updateLabels(isLight, instance.darkLabel, instance.lightLabel);
        });
      }

      // Initialize all instances
      syncAllToggles(isLight);

      // Set up each toggle instance
      toggleInstances.forEach(function (instance) {
        instance.checkbox.addEventListener("change", function () {
          isLight = instance.checkbox.checked;
          applyMode(isLight);
          localStorage.setItem("savedTheme", isLight ? "light" : "dark");
          syncAllToggles(isLight);
        });
      });

      // Listen for OS preference changes if no saved preference
      if (savedTheme === null) {
        prefersColorScheme.addEventListener("change", function (e) {
          isLight = !e.matches;
          applyMode(isLight);
          syncAllToggles(isLight);
        });
      }
    });
  })();
