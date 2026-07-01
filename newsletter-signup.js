(function () {
  const forms = [...document.querySelectorAll("[data-newsletter-form]")];

  if (!forms.length) {
    return;
  }

  const consentValue = (value) => value === "yes" || value === "on" || value === "true" || value === true;

  const setStatus = (form, message) => {
    const status = form.querySelector("[data-newsletter-status]");

    if (status) {
      status.textContent = message || "";
    }
  };

  const setSubmitting = (form, isSubmitting) => {
    const submitButton = form.querySelector("[data-newsletter-submit]") || form.querySelector('button[type="submit"]');

    form.toggleAttribute("aria-busy", isSubmitting);

    if (!submitButton) {
      return;
    }

    if (!submitButton.dataset.defaultLabel) {
      submitButton.dataset.defaultLabel = submitButton.textContent;
    }

    submitButton.disabled = isSubmitting;
    submitButton.textContent = isSubmitting ? "Sending..." : submitButton.dataset.defaultLabel;
  };

  const payloadFromForm = (form) => {
    const data = Object.fromEntries(new FormData(form).entries());

    return {
      firstName: data.firstName || "",
      email: data.email || "",
      consent: consentValue(data.consent),
      website: data.website || "",
      source: form.dataset.newsletterSource || window.location.pathname
    };
  };

  forms.forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      form.classList.add("was-submitted");

      if (!form.reportValidity()) {
        setStatus(form, "Please enter your email and confirm consent.");
        return;
      }

      setSubmitting(form, true);
      setStatus(form, "Sending confirmation...");

      try {
        const response = await fetch(form.action || "/api/newsletter", {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify(payloadFromForm(form))
        });
        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(result.error || "Newsletter signup is not available right now.");
        }

        form.reset();
        form.classList.remove("was-submitted");
        setStatus(form, result.message || "Please check your inbox to confirm your subscription.");
      } catch (error) {
        setStatus(form, error.message);
      } finally {
        setSubmitting(form, false);
      }
    });
  });
}());
