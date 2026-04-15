import os
import sys
import logging
from datetime import datetime

import django

# Setup Django manually
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
django.setup()

from django.db import transaction
from apps.inventory.models import Batch
from apps.purchases.models import PurchaseItem

# Setup logging
log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logs')
os.makedirs(log_dir, exist_ok=True)
logging.basicConfig(
    filename=os.path.join(log_dir, f"batch_correction_{datetime.now().strftime('%Y-%m-%d')}.log"),
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setLevel(logging.INFO)
logging.getLogger().addHandler(console_handler)
logger = logging.getLogger(__name__)

def run_correction(apply_changes=False):
    print("==================================================")
    print("   MEDIFLOW BATCH CORRECTION SCRIPT")
    print(f"   Mode: {'APPLY (Database Will Be Modified)' if apply_changes else 'DRY RUN'}")
    print("==================================================\n")
    
    batches = Batch.objects.prefetch_related('purchase_items', 'product').all()
    
    corrupted_count = 0
    fixed_count = 0
    
    for batch in batches:
        pis = batch.purchase_items.all()
        if not pis:
            continue
            
        pack_size = batch.product.pack_size if batch.product else 1
        
        original_wrong_qty_strips = sum(pi.actual_qty for pi in pis)
        correct_qty_strips = sum(pi.qty + pi.free_qty for pi in pis)
        
        if original_wrong_qty_strips <= correct_qty_strips:
            continue
            
        is_corrupted = False
        
        # User defined criteria + deductive checking
        if batch.qty_strips > 0 and batch.qty_strips % pack_size == 0 and (batch.qty_strips // pack_size) == correct_qty_strips:
            is_corrupted = True
        elif batch.qty_strips > correct_qty_strips:
            is_corrupted = True
            
        if not is_corrupted:
            continue
            
        corrupted_count += 1
        
        units_deducted = original_wrong_qty_strips - batch.qty_strips
        if units_deducted < 0:
            units_deducted = 0
            
        strips_deducted = units_deducted // pack_size
        corrected_qty_strips = correct_qty_strips - strips_deducted
        
        if corrected_qty_strips < 0:
            logger.warning(f"Batch {batch.batch_no} corrected_qty_strips < 0 ({corrected_qty_strips}). Setting to 0.")
            corrected_qty_strips = 0
            
        prod_name = batch.product.name if batch.product else 'Unknown'
        print(f"Batch: {batch.batch_no} | Product: {prod_name} | pack_size: {pack_size}")
        print(f"Current qty_strips : {batch.qty_strips}  (WRONG — stored tablets)")
        print(f"Correct qty_strips : {correct_qty_strips}   (expected starting strips)")
        print(f"Units deducted     : {units_deducted}")
        print(f"Final qty_strips   : {corrected_qty_strips}")
        print("─────────────────────────────────────")
        
        if apply_changes:
            try:
                with transaction.atomic():
                    old_value = batch.qty_strips
                    batch.qty_strips = corrected_qty_strips
                    batch.save(update_fields=['qty_strips'])
                    logger.info(f"Fixed batch {batch.batch_no}: qty_strips {old_value} -> {corrected_qty_strips}")
                    fixed_count += 1
            except Exception as e:
                logger.error(f"Failed to fix batch {batch.batch_no}: {str(e)}")

    print(f"Total corrupted batches found: {corrupted_count}")
    print(f"Total batches to fix: {corrupted_count}")
    print("==================================================")
    
    if not apply_changes:
        print("DRY RUN complete. No changes made. Run with --apply to fix.")
    else:
        print(f"APPLY complete. Fixed {fixed_count} batches.")

if __name__ == '__main__':
    apply = '--apply' in sys.argv
    run_correction(apply)
