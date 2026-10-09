// CampusSync Noticeboard
// Notices live in a Supabase table called "notices".
// Flyer images live in a Supabase storage bucket called "flyers".

// ---------------------------------------------------------------
// 1. Settings and shared state
// ---------------------------------------------------------------

const CATEGORIES = ["General", "Exam", "Event", "Placement", "Club", "Holiday", "Urgent"];
const PIN_COLOURS = ["#d62d2d", "#2563eb", "#f59e0b", "#7c3aed", "#0d9488"];
const STARRED_PIN_COLOUR = "#f59e0b";
const IMAGE_BUCKET = "flyers";
const MAX_IMAGE_SIZE = 1200;      // longest side of an uploaded flyer, in pixels
const IMAGE_QUALITY = 0.8;        // JPEG quality, 0 to 1

const state = {
  notices: [],
  categoryFilter: "All",
  searchText: "",
  editingNotice: null,     // the notice being edited, or null when adding a new one
  newImageBlob: null,      // a freshly chosen image waiting to be uploaded
  removeImage: false,      // true if the user removed the existing image
  zoomedNotice: null,
};

// Shortcuts to elements on the page
const $ = (id) => document.getElementById(id);

const ui = {
  board: $("board"),
  banner: $("banner"),
  search: $("search"),
  chips: $("chips"),
  newButton: $("new-button"),
  formDialog: $("form-dialog"),
  formTitle: $("form-title"),
  formError: $("form-error"),
  fieldTitle: $("field-title"),
  fieldBody: $("field-body"),
  fieldImage: $("field-image"),
  fieldCategory: $("field-category"),
  fieldDate: $("field-date"),
  fieldAuthor: $("field-author"),
  imagePreview: $("image-preview"),
  removeImageButton: $("remove-image"),
  cancelButton: $("cancel-button"),
  saveButton: $("save-button"),
  zoomDialog: $("zoom-dialog"),
  zoomImage: $("zoom-image"),
};

// ---------------------------------------------------------------
// 2. Connect to Supabase
// ---------------------------------------------------------------

let db = null;

function connectToSupabase() {
  const notSetUp = CONFIG.SUPABASE_URL.startsWith("YOUR_") || CONFIG.SUPABASE_KEY.startsWith("YOUR_");

  if (notSetUp) {
    showBanner("Setup needed: open config.js and paste in your Supabase URL and key (see README.md).");
    return false;
  }

  db = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
  return true;
}

// ---------------------------------------------------------------
// 3. Small helpers
// ---------------------------------------------------------------

function showBanner(message) {
  ui.banner.textContent = message;
  ui.banner.hidden = !message;
}

// Create an element with an optional class and text
function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

// Turn an id into a number, so each notice always gets the same pin colour
function hashString(text) {
  let hash = 0;
  for (const character of text) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0;
  }
  return Math.abs(hash);
}

function formatDate(isoString) {
  return new Date(isoString).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function isImageOnly(notice) {
  return Boolean(notice.image_url) && !notice.title && !notice.body && !notice.author && !notice.event_date;
}

// ---------------------------------------------------------------
// 4. Drawing the board
// ---------------------------------------------------------------

function buildChips() {
  ui.chips.innerHTML = "";

  for (const category of ["All", ...CATEGORIES]) {
    const chip = makeElement("button", "chip", category);
    if (category === state.categoryFilter) chip.classList.add("active");

    chip.addEventListener("click", () => {
      state.categoryFilter = category;
      buildChips();
      renderBoard();
    });

    ui.chips.appendChild(chip);
  }
}

function getVisibleNotices() {
  const search = state.searchText.toLowerCase();

  return state.notices
    .filter((notice) => {
      if (state.categoryFilter !== "All" && notice.category !== state.categoryFilter) return false;
      if (!search) return true;
      const text = `${notice.title} ${notice.body} ${notice.author}`.toLowerCase();
      return text.includes(search);
    })
    .sort((a, b) => {
      if (a.starred !== b.starred) return a.starred ? -1 : 1;     // starred first
      return new Date(b.created_at) - new Date(a.created_at);     // then newest first
    });
}

function buildNoticeCard(notice) {
  const card = makeElement("div", "note");
  const pinColour = notice.starred ? STARRED_PIN_COLOUR : PIN_COLOURS[hashString(notice.id) % PIN_COLOURS.length];
  card.style.setProperty("--pin-colour", pinColour);
  card.appendChild(makeElement("span", "pin"));

  // Image (if any). Tapping it opens the full-size view.
  if (notice.image_url) {
    const image = makeElement("img", "flyer");
    image.src = notice.image_url;
    image.alt = "Flyer";
    image.addEventListener("click", () => openZoom(notice));
    card.appendChild(image);
  }

  // Image-only notices show nothing but the image and the pin
  if (isImageOnly(notice)) {
    card.classList.add("image-only");
    return card;
  }

  card.classList.add(`cat-${notice.category}`);

  // Small line: starred, category, date posted, author, event date
  const meta = makeElement("div", "note-meta");
  if (notice.starred) meta.appendChild(makeElement("span", "", "⭐ Important"));
  meta.appendChild(makeElement("span", "tag", notice.category));
  meta.appendChild(makeElement("span", "", formatDate(notice.created_at)));
  if (notice.author) meta.appendChild(makeElement("span", "", `· ${notice.author}`));
  if (notice.event_date) meta.appendChild(makeElement("span", "", `· 🗓 ${notice.event_date}`));
  card.appendChild(meta);

  if (notice.title) card.appendChild(makeElement("h3", "", notice.title));
  if (notice.body) card.appendChild(makeElement("p", "", notice.body));

  // Buttons
  const actions = makeElement("div", "note-actions");
  actions.appendChild(makeActionButton(notice.starred ? "Unstar" : "Star", "", () => toggleStar(notice)));
  actions.appendChild(makeActionButton("Edit", "", () => openForm(notice)));
  actions.appendChild(makeActionButton("Remove", "danger", () => deleteNotice(notice)));
  card.appendChild(actions);

  return card;
}

function makeActionButton(label, extraClass, onClick) {
  const button = makeElement("button", `button small ${extraClass}`, label);
  button.addEventListener("click", onClick);
  return button;
}

function renderBoard() {
  ui.board.innerHTML = "";
  const notices = getVisibleNotices();

  if (notices.length === 0) {
    ui.board.appendChild(makeElement("div", "empty-message", "The board is empty. Pin the first notice!"));
    return;
  }

  for (const notice of notices) {
    ui.board.appendChild(buildNoticeCard(notice));
  }
}

// ---------------------------------------------------------------
// 5. Loading notices from the database
// ---------------------------------------------------------------

async function loadNotices() {
  const { data, error } = await db.from("notices").select("*");

  if (error) {
    showBanner("Couldn't load notices. Check your Supabase setup (see README.md).");
    console.error(error);
    return;
  }

  state.notices = data;
  renderBoard();
}

// Reload whenever anyone adds, edits or removes a notice
function listenForChanges() {
  db.channel("notices-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "notices" }, loadNotices)
    .subscribe();
}

// ---------------------------------------------------------------
// 6. Images: shrink before uploading, upload, delete
// ---------------------------------------------------------------

// Shrinks a picked image and returns it as a JPEG blob
function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      const scale = Math.min(1, MAX_IMAGE_SIZE / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);

      const context = canvas.getContext("2d");
      context.fillStyle = "#fff";                       // fills any transparent areas
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not convert image"))), "image/jpeg", IMAGE_QUALITY);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };

    image.src = url;
  });
}

async function uploadImage(blob) {
  const path = `${crypto.randomUUID()}.jpg`;
  const { error } = await db.storage.from(IMAGE_BUCKET).upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw error;

  const { data } = db.storage.from(IMAGE_BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl };
}

async function deleteImageFile(path) {
  if (!path) return;
  await db.storage.from(IMAGE_BUCKET).remove([path]);
}

// ---------------------------------------------------------------
// 7. Add / edit form
// ---------------------------------------------------------------

function showImagePreview(url) {
  ui.imagePreview.hidden = !url;
  ui.removeImageButton.hidden = !url;
  if (url) ui.imagePreview.src = url;
}

function openForm(notice) {
  state.editingNotice = notice || null;
  state.newImageBlob = null;
  state.removeImage = false;

  ui.formTitle.textContent = notice ? "Edit notice" : "Pin a notice";
  ui.fieldTitle.value = notice ? notice.title : "";
  ui.fieldBody.value = notice ? notice.body : "";
  ui.fieldCategory.value = notice ? notice.category : "General";
  ui.fieldDate.value = notice && notice.event_date ? notice.event_date : "";
  ui.fieldAuthor.value = notice ? notice.author : (localStorage.getItem("campussync_name") || "");
  ui.fieldImage.value = "";
  ui.formError.hidden = true;
  ui.saveButton.disabled = false;
  showImagePreview(notice ? notice.image_url : null);

  ui.formDialog.showModal();
  ui.fieldTitle.focus();
}

function showFormError(message) {
  ui.formError.textContent = message;
  ui.formError.hidden = false;
}

async function onImagePicked() {
  const file = ui.fieldImage.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    showFormError("Please choose an image file.");
    return;
  }

  try {
    state.newImageBlob = await shrinkImage(file);
    state.removeImage = false;
    ui.formError.hidden = true;
    showImagePreview(URL.createObjectURL(state.newImageBlob));
  } catch (error) {
    showFormError("Couldn't read that image. Try a different one.");
  }
}

function onRemoveImage() {
  state.newImageBlob = null;
  state.removeImage = true;
  ui.fieldImage.value = "";
  showImagePreview(null);
}

async function saveNotice() {
  const title = ui.fieldTitle.value.trim();
  const editing = state.editingNotice;

  // The notice will still have an image if: a new one was picked, or the old one was kept
  const willHaveImage = Boolean(state.newImageBlob) || (editing && editing.image_url && !state.removeImage);

  if (!title && !willHaveImage) {
    showFormError("Add a title or a flyer image.");
    return;
  }

  ui.saveButton.disabled = true;

  const fields = {
    title,
    body: ui.fieldBody.value.trim(),
    category: ui.fieldCategory.value,
    event_date: ui.fieldDate.value || null,
    author: ui.fieldAuthor.value.trim(),
  };

  localStorage.setItem("campussync_name", fields.author);

  try {
    let oldImagePathToDelete = null;

    if (state.newImageBlob) {
      const uploaded = await uploadImage(state.newImageBlob);
      fields.image_url = uploaded.url;
      fields.image_path = uploaded.path;
      if (editing) oldImagePathToDelete = editing.image_path;
    } else if (state.removeImage && editing) {
      fields.image_url = null;
      fields.image_path = null;
      oldImagePathToDelete = editing.image_path;
    }

    const query = editing
      ? db.from("notices").update(fields).eq("id", editing.id)
      : db.from("notices").insert(fields);

    const { error } = await query;
    if (error) throw error;

    await deleteImageFile(oldImagePathToDelete);

    ui.formDialog.close();
    await loadNotices();
  } catch (error) {
    console.error(error);
    showFormError("Couldn't save. Check your internet connection and try again.");
    ui.saveButton.disabled = false;
  }
}

// ---------------------------------------------------------------
// 8. Star and delete
// ---------------------------------------------------------------

async function toggleStar(notice) {
  const { error } = await db.from("notices").update({ starred: !notice.starred }).eq("id", notice.id);
  if (error) return showBanner("Couldn't update that notice.");
  await loadNotices();
}

async function deleteNotice(notice) {
  if (!confirm("Take this notice down for everyone?")) return;

  const { error } = await db.from("notices").delete().eq("id", notice.id);
  if (error) return showBanner("Couldn't remove that notice.");

  await deleteImageFile(notice.image_path);
  await loadNotices();
}

// ---------------------------------------------------------------
// 9. Full-size flyer view
// ---------------------------------------------------------------

function openZoom(notice) {
  state.zoomedNotice = notice;
  ui.zoomImage.src = notice.image_url;
  ui.zoomDialog.querySelector('[data-action="star"]').textContent = notice.starred ? "Unstar" : "Star";
  ui.zoomDialog.showModal();
}

function onZoomClick(event) {
  const button = event.target.closest("button[data-action]");

  // Clicking outside the buttons closes the view
  if (!button) {
    ui.zoomDialog.close();
    return;
  }

  const notice = state.zoomedNotice;
  const action = button.dataset.action;
  ui.zoomDialog.close();

  if (action === "star") toggleStar(notice);
  if (action === "edit") openForm(notice);
  if (action === "delete") deleteNotice(notice);
}

// ---------------------------------------------------------------
// 10. Start the app
// ---------------------------------------------------------------

function start() {
  ui.fieldCategory.innerHTML = CATEGORIES.map((c) => `<option>${c}</option>`).join("");
  buildChips();

  ui.newButton.addEventListener("click", () => openForm(null));
  ui.cancelButton.addEventListener("click", () => ui.formDialog.close());
  ui.saveButton.addEventListener("click", saveNotice);
  ui.fieldImage.addEventListener("change", onImagePicked);
  ui.removeImageButton.addEventListener("click", onRemoveImage);
  ui.zoomDialog.addEventListener("click", onZoomClick);
  ui.search.addEventListener("input", () => {
    state.searchText = ui.search.value.trim();
    renderBoard();
  });

  if (connectToSupabase()) {
    loadNotices();
    listenForChanges();
  } else {
    renderBoard();
  }
}

start();
