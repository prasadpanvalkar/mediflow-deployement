"""
Seed script: 5 master products + batches for the first outlet.
Run: docker-compose exec backend python manage.py shell < seed_test_products.py
"""
import sys
from datetime import date

# ── Outlet ──────────────────────────────────────────────────────────────────
from apps.core.models import Outlet
from apps.inventory.models import MasterProduct, Batch

outlet = Outlet.objects.first()
if not outlet:
    print("ERROR: No outlet found in the database. Create one first.")
    sys.exit(1)

print(f"Using outlet: {outlet.name} ({outlet.id})\n")

# ── Product definitions ──────────────────────────────────────────────────────
# Note: hsn_code is unique per MasterProduct; using distinct codes per product.
PRODUCTS = [
    {
        "name": "Paracetamol 500mg Tablet",
        "composition": "Paracetamol 500mg",
        "manufacturer": "Cipla Ltd",
        "hsn_code": "30049099",
        "gst_rate": 5,
        "schedule_type": "OTC",
        "pack_size": 10,
        "pack_unit": "tablet",
        "pack_type": "strip",
        "drug_type": "allopathy",
        "category": "Analgesic",
        "batch_no": "PC2026A",
        "expiry_date": date(2028, 12, 31),
        "mrp": 22,
        "purchase_rate": 14,
        "sale_rate": 18,
        "qty_strips": 100,
    },
    {
        "name": "Cetirizine 10mg Tablet",
        "composition": "Cetirizine Hydrochloride 10mg",
        "manufacturer": "Sun Pharma",
        "hsn_code": "30049052",
        "gst_rate": 5,
        "schedule_type": "OTC",
        "pack_size": 10,
        "pack_unit": "tablet",
        "pack_type": "strip",
        "drug_type": "allopathy",
        "category": "Antihistamine",
        "batch_no": "CT2026B",
        "expiry_date": date(2028, 12, 31),
        "mrp": 35,
        "purchase_rate": 22,
        "sale_rate": 28,
        "qty_strips": 50,
    },
    {
        "name": "Azithromycin 500mg Tablet",
        "composition": "Azithromycin 500mg",
        "manufacturer": "Cipla Ltd",
        "hsn_code": "30041099",
        "gst_rate": 5,
        "schedule_type": "H",
        "pack_size": 3,
        "pack_unit": "tablet",
        "pack_type": "strip",
        "drug_type": "allopathy",
        "category": "Antibiotic",
        "batch_no": "AZ2026D",
        "expiry_date": date(2028, 12, 31),
        "mrp": 85,
        "purchase_rate": 55,
        "sale_rate": 70,
        "qty_strips": 30,
    },
    {
        "name": "Digene Gel 200ml",
        "composition": "Aluminium Hydroxide + Magnesium Hydroxide",
        "manufacturer": "Abbott",
        "hsn_code": "30049041",
        "gst_rate": 12,
        "schedule_type": "OTC",
        "pack_size": 1,
        "pack_unit": "bottle",
        "pack_type": "bottle",
        "drug_type": "allopathy",
        "category": "Antacid",
        "batch_no": "DG2026C",
        "expiry_date": date(2028, 12, 31),
        "mrp": 165,
        "purchase_rate": 110,
        "sale_rate": 140,
        "qty_strips": 20,
    },
    {
        "name": "Vitamin D3 60K Capsule",
        "composition": "Cholecalciferol 60000 IU",
        "manufacturer": "Sun Pharma",
        "hsn_code": "29362200",
        "gst_rate": 12,
        "schedule_type": "OTC",
        "pack_size": 4,
        "pack_unit": "capsule",
        "pack_type": "strip",
        "drug_type": "allopathy",
        "category": "Vitamin",
        "batch_no": "VD2026E",
        "expiry_date": date(2028, 12, 31),
        "mrp": 120,
        "purchase_rate": 80,
        "sale_rate": 100,
        "qty_strips": 40,
    },
]

# ── Seed ─────────────────────────────────────────────────────────────────────
seeded_products = 0
seeded_batches = 0
results = []

for p in PRODUCTS:
    try:
        # Check if product already exists by name
        if MasterProduct.objects.filter(name=p["name"]).exists():
            print(f"  SKIP (already exists): {p['name']}")
            product = MasterProduct.objects.get(name=p["name"])
        else:
            product = MasterProduct.objects.create(
                name=p["name"],
                composition=p["composition"],
                manufacturer=p["manufacturer"],
                category=p["category"],
                drug_type=p["drug_type"],
                schedule_type=p["schedule_type"],
                hsn_code=p["hsn_code"],
                gst_rate=p["gst_rate"],
                pack_size=p["pack_size"],
                pack_unit=p["pack_unit"],
                pack_type=p["pack_type"],
            )
            seeded_products += 1
            print(f"  Created product: {product.name}")

        # Create batch only if one with same batch_no + outlet doesn't exist
        if Batch.objects.filter(outlet=outlet, batch_no=p["batch_no"]).exists():
            print(f"  SKIP batch (already exists): {p['batch_no']}")
            batch = Batch.objects.get(outlet=outlet, batch_no=p["batch_no"])
        else:
            batch = Batch.objects.create(
                outlet=outlet,
                product=product,
                batch_no=p["batch_no"],
                expiry_date=p["expiry_date"],
                mrp=p["mrp"],
                purchase_rate=p["purchase_rate"],
                sale_rate=p["sale_rate"],
                qty_strips=p["qty_strips"],
                qty_loose=0,
                is_active=True,
            )
            seeded_batches += 1

        results.append({
            "name": product.name,
            "schedule": product.schedule_type,
            "qty": batch.qty_strips,
            "batch": batch.batch_no,
        })

    except Exception as e:
        print(f"  ERROR seeding '{p['name']}': {e}")
        continue

# ── Summary ──────────────────────────────────────────────────────────────────
print(f"\n✓ Seeded {seeded_products} products, {seeded_batches} batches for outlet: {outlet.name}")
print(f"\n{'Product':<35} {'Schedule':<10} {'Qty':>5}  {'Batch'}")
print("-" * 65)
for r in results:
    print(f"{r['name']:<35} {r['schedule']:<10} {r['qty']:>5}  {r['batch']}")
