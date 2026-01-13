// controllers/rentacarController.js
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const fileStore = require('../services/fileStore');

// Allowed statuses for reservations
const STATUS = {
  PICKED_UP: "Götürülüb",
  IN_USE: "İstifadədədir",
  RETURNED: "Qaytarılıb",
  ON_HOLD: "Brondadır",
  CANCELED: "Ləğv edilib",
  NOT_RETURNED: "Qaytarılmayıb",
};

// --- Helpers ---
const toDate = (d) => (d ? new Date(d) : null);
const todayYMD = () => new Date().toISOString().split('T')[0];

/**
 * Auto-update expired reservations:
 * If now > returnDate and status is not RETURNED/CANCELED -> NOT_RETURNED
 */
function autoUpdateStatuses(reservations) {
  const now = new Date();
  let changed = false;
  const updated = reservations.map(r => {
    const ret = toDate(r.returnDate);
    if (ret && now > ret && ![STATUS.RETURNED, STATUS.CANCELED, STATUS.NOT_RETURNED].includes(r.status)) {
      changed = true;
      return { ...r, status: STATUS.NOT_RETURNED };
    }
    return r;
  });
  return { updated, changed };
}

// ---- Cars ----
async function listCars(req, res) {
  const cars = await fileStore.getRentCars();
  res.json(cars);
}

async function createCar(req, res) {
  try {
    const cars = await fileStore.getRentCars();
    const { plate, brand, model, year, color, notes } = req.body;
    if (!plate) return res.status(400).json({ message: "Maşının nömrəsi (plate) vacibdir" });
    if (cars.find(c => c.plate === plate)) {
      return res.status(400).json({ message: "Bu nömrə ilə maşın artıq mövcuddur" });
    }
    const car = {
      id: uuidv4(),
      plate,
      brand: brand || "",
      model: model || "",
      year: year || "",
      color: color || "",
      notes: notes || "",
      createdAt: new Date().toISOString(),
      createdBy: req.session?.user?.username || "system"
    };
    cars.push(car);
    await fileStore.saveAllRentCars(cars);
    res.status(201).json(car);
  } catch (e) {
    res.status(500).json({ message: "Xəta baş verdi", error: e.message });
  }
}

async function updateCar(req, res) {
  try {
    const id = req.params.id;
    const cars = await fileStore.getRentCars();
    const idx = cars.findIndex(c => c.id === id);
    if (idx === -1) return res.status(404).json({ message: "Maşın tapılmadı" });
    const allowed = ["plate", "brand", "model", "year", "color", "notes"];
    for (const k of allowed) {
      if (k in req.body) cars[idx][k] = req.body[k];
    }
    cars[idx].updatedAt = new Date().toISOString();
    cars[idx].updatedBy = req.session?.user?.username || "system";
    await fileStore.saveAllRentCars(cars);
    res.json(cars[idx]);
  } catch (e) {
    res.status(500).json({ message: "Xəta baş verdi", error: e.message });
  }
}

async function deleteCar(req, res) {
  const id = req.params.id;
  const cars = await fileStore.getRentCars();
  const left = cars.filter(c => c.id !== id);
  if (left.length === cars.length) return res.status(404).json({ message: "Maşın tapılmadı" });
  await fileStore.saveAllRentCars(left);
  res.json({ ok: true });
}

// ---- Reservations ----
async function listReservations(req, res) {
  const q = (req.query.q || "").toLowerCase().trim();
  const reservations = await fileStore.getRentReservations();
  const { updated, changed } = autoUpdateStatuses(reservations);
  if (changed) await fileStore.saveAllRentReservations(updated);

  let filtered = updated;
  if (q) {
    filtered = updated.filter(r =>
      (r.carPlate || "").toLowerCase().includes(q) ||
      (r.customerName || "").toLowerCase().includes(q) ||
      (r.phone || "").toLowerCase().includes(q)
    );
  }
  res.json(filtered);
}

async function createReservation(req, res) {
  try {
    const reservations = await fileStore.getRentReservations();
    const {
      carPlate, customerName, phone, idNumber, notes,
      pickupDate, returnDate, status
    } = req.body;

    if (!carPlate || !customerName || !phone || !pickupDate || !returnDate) {
      return res.status(400).json({ message: "Zəruri sahələr doldurulmalıdır" });
    }

    // calc days
    const start = new Date(pickupDate);
    const end = new Date(returnDate);
    const days = Math.max(1, Math.ceil((end - start) / (1000*60*60*24)));

    const idImagePath = req.file ? `/uploads/id_images/${req.file.filename}` : (req.body.idImagePath || "");

    const resv = {
      id: uuidv4(),
      carPlate, customerName, phone, idNumber: idNumber || "",
      notes: notes || "",
      pickupDate, returnDate, days,
      status: status || STATUS.ON_HOLD,
      idImagePath,
      createdAt: new Date().toISOString(),
      createdBy: req.session?.user?.username || "system"
    };
    reservations.push(resv);
    await fileStore.saveAllRentReservations(reservations);
    res.status(201).json(resv);
  } catch (e) {
    res.status(500).json({ message: "Xəta baş verdi", error: e.message });
  }
}

async function updateReservation(req, res) {
  try {
    const id = req.params.id;
    const reservations = await fileStore.getRentReservations();
    const idx = reservations.findIndex(r => r.id === id);
    if (idx === -1) return res.status(404).json({ message: "Rezerv tapılmadı" });

    const allowed = ["carPlate","customerName","phone","idNumber","notes","pickupDate","returnDate","status"];
    for (const k of allowed) {
      if (k in req.body) reservations[idx][k] = req.body[k];
    }
    if (req.file) {
      reservations[idx].idImagePath = `/uploads/id_images/${req.file.filename}`;
    }
    // recalc days
    const s = toDate(reservations[idx].pickupDate);
    const e = toDate(reservations[idx].returnDate);
    if (s && e) {
      reservations[idx].days = Math.max(1, Math.ceil((e - s) / (1000*60*60*24)));
    }
    reservations[idx].updatedAt = new Date().toISOString();
    reservations[idx].updatedBy = req.session?.user?.username || "system";

    await fileStore.saveAllRentReservations(reservations);
    res.json(reservations[idx]);
  } catch (e) {
    res.status(500).json({ message: "Xəta baş verdi", error: e.message });
  }
}

async function deleteReservation(req, res) {
  const id = req.params.id;
  const reservations = await fileStore.getRentReservations();
  const left = reservations.filter(r => r.id !== id);
  if (left.length === reservations.length) return res.status(404).json({ message: "Rezerv tapılmadı" });
  await fileStore.saveAllRentReservations(left);
  res.json({ ok: true });
}

module.exports = {
  STATUS,
  listCars, createCar, updateCar, deleteCar,
  listReservations, createReservation, updateReservation, deleteReservation
};
