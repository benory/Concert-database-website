(function () {
  "use strict";

  let turnstileScript;

  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (!turnstileScript) {
      turnstileScript = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.onload = () => {
          if (window.turnstile) resolve(window.turnstile);
          else onError();
        };
        function onError() {
          script.remove();
          turnstileScript = undefined;
          reject(new Error("Turnstile did not load."));
        }
        script.onerror = onError;
        document.head.append(script);
      });
    }
    return turnstileScript;
  }

  function setup(concert) {
    const opener = document.querySelector("[data-open-correction]");
    const dialog = document.getElementById("correction-dialog");
    const { workerUrl, sitekey } = dialog.dataset;
    if (!workerUrl || !sitekey) return;

    const form = dialog.querySelector("form");
    const submit = form.querySelector("button[type=submit]");
    const close = dialog.querySelector("[data-dialog-close]");
    const status = dialog.querySelector(".correction-status");
    const challenge = form.querySelector("[data-correction-turnstile]");
    const title = concert.title || "Untitled concert";
    const date = concert.date || concert.year || "";
    dialog.querySelector("[data-correction-title]").textContent = title;
    dialog.querySelector("[data-correction-date]").textContent = date;

    let widget;
    let token = "";
    let pending = false;
    let opening = 0;

    function setStatus(message = "", error = false) {
      status.textContent = message;
      status.classList.toggle("is-error", error);
    }

    function updateToken(value = "") {
      token = value;
      submit.disabled = !token || pending;
    }

    opener.addEventListener("click", async () => {
      const currentOpening = ++opening;
      form.reset();
      form.hidden = false;
      updateToken();
      setStatus("Loading verification…");
      dialog.showModal();
      document.getElementById("person-preview")?.setAttribute("hidden", "");
      try {
        const turnstile = await loadTurnstile();
        if (!dialog.open || currentOpening !== opening) return;
        setStatus();
        widget = turnstile.render(challenge, {
          sitekey,
          action: "concert-correction",
          "response-field": false,
          size: challenge.clientWidth < 300 ? "compact" : "flexible",
          callback: (response) => {
            updateToken(response);
            if (status.dataset.verificationError) setStatus();
            delete status.dataset.verificationError;
          },
          "expired-callback": () => updateToken(),
          "error-callback": () => {
            updateToken();
            if (!pending) {
              status.dataset.verificationError = "true";
              setStatus("Verification is unavailable. Try reopening the form.", true);
            }
          },
        });
      } catch {
        if (dialog.open && currentOpening === opening) {
          setStatus("Verification could not load. Close and reopen the form to try again.", true);
        }
      }
    });

    function closeDialog() {
      if (!pending) dialog.close();
    }

    close.addEventListener("click", closeDialog);
    dialog.addEventListener("cancel", (event) => {
      if (pending) event.preventDefault();
    });
    dialog.addEventListener("click", (event) => {
      const bounds = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right
        || event.clientY < bounds.top || event.clientY > bounds.bottom)) closeDialog();
    });
    dialog.addEventListener("close", () => {
      if (widget !== undefined) window.turnstile.remove(widget);
      widget = undefined;
      updateToken();
      delete status.dataset.verificationError;
      form.reset();
      opener.focus({ preventScroll: true });
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (pending || !token || !form.reportValidity()) return;

      const data = new URLSearchParams(new FormData(form));
      if (!data.get("description").trim()) {
        setStatus("Enter a correction before sending.", true);
        form.elements.description.focus();
        return;
      }
      data.set("concert_id", concert.id);
      data.set("concert_label", [title, date].filter(Boolean).join(" · "));
      data.set("cf-turnstile-response", token);

      pending = true;
      updateToken();
      close.disabled = true;
      setStatus("Sending correction…");
      try {
        const response = await fetch(workerUrl, {
          method: "POST",
          body: data,
          signal: AbortSignal.timeout(18000),
        });
        if (!response.ok || (await response.json()).ok !== true) throw new Error("Submission failed.");
        form.reset();
        form.hidden = true;
        setStatus("Thank you. Your correction was submitted.");
      } catch {
        setStatus("Your correction could not be sent. Please try again.", true);
        if (widget !== undefined) window.turnstile.reset(widget);
      } finally {
        pending = false;
        close.disabled = false;
        if (form.hidden) close.focus();
        else updateToken(token);
      }
    });

    opener.hidden = false;
  }

  window.ConcertCorrections = { setup };
}());
