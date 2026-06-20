// ---- Mobile Navigation Toggle ----
(function () {
    const toggle = document.getElementById('nav-toggle');
    const nav = document.getElementById('site-nav');

    if (!toggle || !nav) return;

    toggle.addEventListener('click', function () {
        toggle.classList.toggle('active');
        nav.classList.toggle('active');
        toggle.setAttribute('aria-expanded', toggle.classList.contains('active'));
    });

    // Close menu when a link is clicked
    nav.addEventListener('click', function (e) {
        if (e.target.tagName === 'A') {
            toggle.classList.remove('active');
            nav.classList.remove('active');
            toggle.setAttribute('aria-expanded', 'false');
        }
    });
})();

// This function watches for elements with the 'reveal' class
const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
        if (entry.isIntersecting) {
            // Add the 'active' class when the element is visible
            entry.target.classList.add('active');
        }
    });
}, {
    threshold: 0.1 // Triggers when 10% of the element is visible
});

// Tell the observer to watch all elements with the 'reveal' class
const revealElements = document.querySelectorAll('.reveal');
revealElements.forEach((el) => observer.observe(el));


// ---- Find Your MP tool ----
// Looks up a federal MP by postal code using the free OpenNorth Represent API,
// then drops the MP's name into the editable message and wires up the send/copy buttons.
(function () {
    const form = document.getElementById('mp-form');
    if (!form) return;

    const input = document.getElementById('postal');
    const status = document.getElementById('mp-status');
    const result = document.getElementById('mp-result');
    const photo = document.getElementById('mp-photo');
    const nameEl = document.getElementById('mp-name');
    const metaEl = document.getElementById('mp-meta');
    const emailLink = document.getElementById('mp-email');
    const subjectEl = document.getElementById('mp-subject');
    const bodyEl = document.getElementById('mp-body');
    const sendBtn = document.getElementById('mp-send');
    const copyBtn = document.getElementById('mp-copy');

    let mpEmail = '';
    let lastName = "[MP's Name]"; // the placeholder currently sitting in the message

    function setStatus(msg, isError) {
        status.textContent = msg;
        status.classList.toggle('error', !!isError);
    }

    // Swap whatever name token is currently in the body for the new MP's name,
    // so re-running the lookup doesn't clobber the user's edits.
    function fillName(name) {
        if (bodyEl.value.includes(lastName)) {
            bodyEl.value = bodyEl.value.split(lastName).join(name);
        }
        lastName = name;
    }

    function showMp(mp) {
        setStatus('', false);
        nameEl.textContent = mp.name;
        metaEl.textContent = [mp.party_name, mp.district_name].filter(Boolean).join(' · ');

        if (mp.photo_url) {
            photo.src = mp.photo_url;
            photo.alt = mp.name;
            photo.hidden = false;
        } else {
            photo.hidden = true;
        }

        mpEmail = mp.email || '';
        if (mpEmail) {
            emailLink.textContent = mpEmail;
            emailLink.href = 'mailto:' + mpEmail;
            emailLink.hidden = false;
        } else {
            emailLink.hidden = true;
        }

        fillName(mp.name);
        result.hidden = false;
        result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    async function lookup(rawCode) {
        const code = rawCode.replace(/\s+/g, '').toUpperCase();
        if (!/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(code)) {
            setStatus('Please enter a valid Canadian postal code (e.g. K1A 0A6).', true);
            return;
        }

        setStatus('Searching…', false);
        result.hidden = true;

        try {
            const pcRes = await fetch('https://represent.opennorth.ca/postcodes/' + code + '/');
            if (!pcRes.ok) throw new Error('postcode');
            const pc = await pcRes.json();

            const [lng, lat] = pc.centroid.coordinates;
            const repRes = await fetch('https://represent.opennorth.ca/representatives/house-of-commons/?point=' + lat + ',' + lng);
            if (!repRes.ok) throw new Error('rep');
            const data = await repRes.json();

            const mp = data.objects && data.objects[0];
            if (!mp) throw new Error('nomp');
            showMp(mp);
        } catch (err) {
            if (err.message === 'postcode') {
                setStatus("We couldn't find that postal code. Double-check it and try again.", true);
            } else {
                setStatus('Something went wrong looking up your MP. You can still search by hand on ourcommons.ca.', true);
            }
        }
    }

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        lookup(input.value);
    });

    sendBtn.addEventListener('click', function () {
        const url = 'mailto:' + encodeURIComponent(mpEmail) +
            '?subject=' + encodeURIComponent(subjectEl.value) +
            '&body=' + encodeURIComponent(bodyEl.value);
        window.location.href = url;
    });

    copyBtn.addEventListener('click', async function () {
        const text = 'Subject: ' + subjectEl.value + '\n\n' + bodyEl.value;
        try {
            await navigator.clipboard.writeText(text);
            copyBtn.textContent = 'Copied!';
            setTimeout(function () { copyBtn.textContent = 'Copy Message'; }, 2000);
        } catch (e) {
            setStatus('Copy failed — select the message text and copy it manually.', true);
        }
    });
})();


// ---- Bill C-34 Legislative Progress Tracker ----
(function () {
    var STATE_COMPLETED   = 4;
    var STATE_IN_PROGRESS = 2;
    var POLL_INTERVAL     = 5 * 60 * 1000; // 5 minutes
    var pollTimer         = null;
    var useLiveData       = false;

    function applyStepState(li, state, dateStr) {
        li.classList.remove('step--completed', 'step--active', 'step--pending');
        var icon = li.querySelector('.step-dot i');

        if (state === STATE_COMPLETED) {
            li.classList.add('step--completed');
            icon.className = 'fas fa-circle-check';
        } else if (state === STATE_IN_PROGRESS) {
            li.classList.add('step--active');
            icon.className = 'fas fa-circle-half-stroke';
        } else {
            li.classList.add('step--pending');
            icon.className = 'fas fa-circle';
        }

        var dateEl = li.querySelector('.step-date');
        if (dateStr && state !== 1) {
            var d = new Date(dateStr);
            dateEl.textContent = d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
        } else {
            dateEl.textContent = '';
        }
    }

    function renderTracker(data, isLive) {
        document.querySelectorAll('.pipeline-step[data-stage]').forEach(function (li) {
            var key = li.getAttribute('data-stage');
            var s = data.stages[key];
            if (s) applyStepState(li, s.state, s.date);
        });

        var summary = document.getElementById('bill-status-summary');
        if (summary) summary.textContent = data.statusText || '';

        var lastUpdated = document.getElementById('bill-last-updated');
        if (lastUpdated && data.fetchedAt) {
            var d = new Date(data.fetchedAt);
            var dateStr = d.toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' });
            var source = isLive ? 'Live' : 'Last updated';
            lastUpdated.textContent = source + ' ' + dateStr + '.';
        }
    }

    function showFallback() {
        var s = document.getElementById('bill-status-summary');
        if (s) s.textContent = 'Status temporarily unavailable. The ban is not currently law — Bill C-34 is moving through Parliament.';
    }

    function fetchFromParliament() {
        fetch('https://www.parl.ca/LegisInfo/en/bill/45-1/c-34/json', {
            headers: { 'Accept': 'application/json' }
        })
            .then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(function (raw) {
                var bill = Array.isArray(raw) ? raw[0] : raw;

                function ts(val) { return val || null; }

                function stageState(stages, name) {
                    for (var i = 0; i < (stages || []).length; i++) {
                        if (stages[i].BillStageName === name || stages[i].BillStageName === name.toLowerCase()) {
                            return stages[i].State;
                        }
                    }
                    return 1;
                }

                var house = bill.BillStages && bill.BillStages.HouseBillStages ? bill.BillStages.HouseBillStages : [];
                var senate = bill.BillStages && bill.BillStages.SenateBillStages ? bill.BillStages.SenateBillStages : [];

                var data = {
                    fetchedAt: new Date().toISOString(),
                    statusText: bill.StatusNameEn || 'Unknown',
                    latestStageName: bill.LatestCompletedBillStageName || '',
                    latestStageDate: ts(bill.LatestCompletedBillStageDateTime),
                    stages: {
                        houseFirstReading:  { state: stageState(house, 'First Reading'),  date: ts(bill.PassedHouseFirstReadingDateTime) },
                        houseSecondReading: { state: stageState(house, 'Second Reading'), date: ts(bill.PassedHouseSecondReadingDateTime) },
                        houseCommittee:     { state: stageState(house, 'Consideration in Committee'), date: null },
                        houseReportStage:   { state: stageState(house, 'Report Stage'),   date: null },
                        houseThirdReading:  { state: stageState(house, 'Third Reading'),  date: ts(bill.PassedHouseThirdReadingDateTime) },
                        senateFirstReading: { state: stageState(senate, 'First Reading'),  date: ts(bill.PassedSenateFirstReadingDateTime) },
                        senateSecondReading:{ state: stageState(senate, 'Second Reading'), date: ts(bill.PassedSenateSecondReadingDateTime) },
                        senateThirdReading: { state: stageState(senate, 'Third Reading'),  date: ts(bill.PassedSenateThirdReadingDateTime) },
                        royalAssent:        { state: bill.ReceivedRoyalAssentDateTime ? 4 : 1, date: ts(bill.ReceivedRoyalAssentDateTime) }
                    }
                };

                useLiveData = true;
                renderTracker(data, true);

                // Start polling only after first successful fetch from parliament.ca
                if (!pollTimer) {
                    pollTimer = setInterval(fetchFromParliament, POLL_INTERVAL);
                }
            })
            .catch(function (err) {
                // CORS failed or network error — fall back to committed JSON
                if (!useLiveData) {
                    fetch('./bill-status.json')
                        .then(function (res) {
                            if (!res.ok) throw new Error('HTTP ' + res.status);
                            return res.json();
                        })
                        .then(function (data) {
                            renderTracker(data, false);
                        })
                        .catch(function () {
                            showFallback();
                        });
                }
            });
    }

    if (!document.getElementById('bill-tracker')) return;

    // Fetch immediately on page load
    fetchFromParliament();
})();


// ---- Petition Form Handler (submits to CCF endpoint) ----
(function () {
    var form = document.getElementById('petition-form');
    var messageEl = document.getElementById('petition-message');

    if (!form) return;

    form.addEventListener('submit', function (e) {
        e.preventDefault();

        var fname = document.getElementById('petition-fname').value.trim();
        var lname = document.getElementById('petition-lname').value.trim();
        var email = document.getElementById('petition-email').value.trim();
        var postal = document.getElementById('petition-postal').value.trim();

        // Validation
        if (!fname || !lname || !email || !postal) {
            showMessage('Please fill in all required fields.', 'error');
            return;
        }

        // Validate email format
        var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            showMessage('Please enter a valid email address.', 'error');
            return;
        }

        // Disable submit button
        var submitBtn = form.querySelector('.petition-submit');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting…';

        // Create form data for CCF petition endpoint
        var formData = new FormData();
        formData.append('action', 'elementor_pro_forms_send_form');
        formData.append('form_id', '25079ee1');
        formData.append('post_id', '19620');
        formData.append('queried_id', '19620');
        formData.append('referer_title', 'Stop Bill C-34 - Canadian Constitution Foundation');
        formData.append('form_fields[fname]', fname);
        formData.append('form_fields[lname]', lname);
        formData.append('form_fields[email]', email);
        formData.append('form_fields[field_3db35f5]', postal);

        // Use no-cors mode to bypass CORS restrictions
        // The submission will go through, we just won't see the response
        fetch('https://theccf.ca/wp-admin/admin-ajax.php', {
            method: 'POST',
            body: formData,
            mode: 'no-cors'
        })
        .then(function () {
            // Assume success after submission (no-cors means we can't read response)
            showMessage('✓ Thank you for signing! Your signature has been added to the petition.', 'success');
            form.reset();
            submitBtn.disabled = false;
            submitBtn.textContent = 'Add My Signature';
        })
        .catch(function () {
            // Network error - show error message
            showMessage('✗ An error occurred. Please try signing the petition directly at theccf.ca/stopc34/', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Add My Signature';
        });
    });

    function showMessage(text, type) {
        messageEl.textContent = text;
        messageEl.className = type;
        messageEl.style.display = 'block';

        // Auto-hide error message after 6 seconds
        if (type === 'error') {
            setTimeout(function () {
                messageEl.style.display = 'none';
            }, 6000);
        }
    }
})();


// ---- Action Counter (petition signs + MP emails) ----
// Shows a live "X people have taken action" count and pings the API when a
// visitor signs the petition or emails their MP. No personal data is sent —
// just an empty POST. The API caps each visitor at one count per day.
(function () {
    var API = 'https://api.backonline.ca';

    var counter = document.getElementById('action-counter');
    var numberEl = document.getElementById('action-counter-number');
    if (!counter || !numberEl) return;

    function render(count) {
        if (typeof count !== 'number' || isNaN(count)) return;
        numberEl.textContent = count.toLocaleString('en-CA');
        counter.hidden = false;
    }

    // Show the current total on load. Stay hidden if the API can't be reached.
    fetch(API + '/api/action-count')
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) { if (d) render(d.count); })
        .catch(function () { /* leave the counter hidden */ });

    // Fire-and-forget. Both the once-per-view guard here and the API's
    // per-visitor daily cap keep repeated clicks from inflating the count.
    var tracked = false;
    function track() {
        if (tracked) return;
        tracked = true;
        fetch(API + '/api/track-action', { method: 'POST', keepalive: true })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) { if (d) render(d.count); })
            .catch(function () { /* ignore */ });
    }

    var petition = document.getElementById('petition-form');
    if (petition) petition.addEventListener('submit', track);

    var mpSend = document.getElementById('mp-send');
    if (mpSend) mpSend.addEventListener('click', track);

    var mpCopy = document.getElementById('mp-copy');
    if (mpCopy) mpCopy.addEventListener('click', track);
})();