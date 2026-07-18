(() => {
  const requestForm = document.querySelector("[data-preferences-request]");
  const requestButton = document.querySelector("[data-preferences-request-submit]");
  const requestStatus = document.querySelector("[data-preferences-request-status]");
  const editor = document.querySelector("[data-preferences-editor]");
  const fieldNotesRow = document.querySelector("[data-field-notes-preference]");
  const fieldNotesCheckbox = document.querySelector("[data-field-notes-checkbox]");
  const saveButton = document.querySelector("[data-preferences-save]");
  const unsubscribeButton = document.querySelector("[data-preferences-unsubscribe]");
  const editorStatus = document.querySelector("[data-preferences-status]");
  const resubscribeNote = document.querySelector("[data-preferences-resubscribe]");
  let token = "";
  let preferences = null;

  const newsletterRequest = async (action, body) => {
    const response = await fetch(`/api/newsletter?action=${encodeURIComponent(action)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "The request could not be completed.");
    }
    return payload;
  };

  const setEditorState = (nextPreferences) => {
    preferences = nextPreferences;
    editor.hidden = false;
    requestForm.hidden = true;
    const topicAvailable = Boolean(preferences.topicConfigured);
    const globallyUnsubscribed = preferences.globallySubscribed === false;
    fieldNotesRow.hidden = !topicAvailable;
    fieldNotesCheckbox.checked = topicAvailable && Boolean(preferences.fieldNotes);
    fieldNotesCheckbox.disabled = globallyUnsubscribed;
    saveButton.hidden = !topicAvailable || globallyUnsubscribed;
    resubscribeNote.hidden = !globallyUnsubscribed;
  };

  const readSecurePreferences = async () => {
    if (!token) return;
    editorStatus.textContent = "Loading your preferences...";
    try {
      const payload = await newsletterRequest("read_preferences", { token });
      setEditorState(payload.preferences);
      editorStatus.textContent = preferences.globallySubscribed
        ? "Your current settings are shown above."
        : "You are unsubscribed from all Davide Studios marketing emails.";
    } catch (error) {
      editor.hidden = true;
      requestForm.hidden = false;
      requestStatus.textContent = `${error.message} Request a new secure link below.`;
    }
  };

  requestForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    requestForm.classList.add("was-submitted");
    if (!requestForm.reportValidity()) return;
    requestButton.disabled = true;
    requestStatus.textContent = "Requesting a secure link...";
    const formData = new FormData(requestForm);
    try {
      const payload = await newsletterRequest("request_preferences", {
        email: String(formData.get("email") || ""),
        website: String(formData.get("website") || "")
      });
      requestStatus.textContent = payload.message;
      requestForm.reset();
      requestForm.classList.remove("was-submitted");
    } catch (error) {
      requestStatus.textContent = error.message;
    } finally {
      requestButton.disabled = false;
    }
  });

  saveButton?.addEventListener("click", async () => {
    if (!token || !preferences?.topicConfigured) return;
    saveButton.disabled = true;
    editorStatus.textContent = "Saving...";
    try {
      const payload = await newsletterRequest("update_preferences", {
        token,
        fieldNotes: fieldNotesCheckbox.checked
      });
      setEditorState(payload.preferences);
      editorStatus.textContent = payload.message;
    } catch (error) {
      editorStatus.textContent = error.message;
    } finally {
      saveButton.disabled = false;
    }
  });

  unsubscribeButton?.addEventListener("click", async () => {
    if (!token || !window.confirm("Unsubscribe from all Davide Studios marketing emails?")) return;
    unsubscribeButton.disabled = true;
    editorStatus.textContent = "Unsubscribing...";
    try {
      const payload = await newsletterRequest("update_preferences", { token, unsubscribeAll: true });
      setEditorState(payload.preferences);
      editorStatus.textContent = payload.message;
    } catch (error) {
      editorStatus.textContent = error.message;
    } finally {
      unsubscribeButton.disabled = false;
    }
  });

  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  token = hash.get("token") || "";
  if (token) {
    window.history.replaceState(null, "", "/preferences");
    readSecurePreferences();
  }
})();
