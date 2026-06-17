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