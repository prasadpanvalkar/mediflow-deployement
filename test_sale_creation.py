import json
from decimal import Decimal
from django.test import Client
from apps.inventory.models import StockLedger, Batch, MasterProduct
from apps.core.models import Outlet
from apps.accounts.models import Customer
from django.contrib.auth import get_user_model

def run():
    print('Total entries before:', StockLedger.objects.count())

    # Setup basic data to make a POST request
    outlet = Outlet.objects.first()
    if not outlet:
        print("No outlet found.")
        return

    # Find a product with active batches
    batch = Batch.objects.filter(outlet=outlet, is_active=True, qty_strips__gt=1).first()
    if not batch:
        print("No active batch with stock found.")
        return
        
    product = batch.product

    User = get_user_model()
    # Find superadmin or manager user to bypass permissions
    user = User.objects.filter(is_superuser=True).first()
    if not user:
        user = User.objects.first()

    customer = Customer.objects.filter(outlet=outlet).first()
    
    client = Client()
    client.force_login(user)

    payload = {
        "outletId": str(outlet.id),
        "customerId": str(customer.id) if customer else None,
        "items": [
            {
                "batchId": str(batch.id),
                "productId": str(product.id),
                "qtyStrips": 1,
                "qtyLoose": 0,
                "rate": float(batch.sale_rate),
                "discountPct": 0,
                "gstRate": float(product.gst_rate),
                "taxableAmount": float(batch.sale_rate),
                "gstAmount": 0,
                "totalAmount": float(batch.sale_rate)
            }
        ],
        "subtotal": float(batch.sale_rate),
        "discountAmount": 0,
        "taxableAmount": float(batch.sale_rate),
        "cgstAmount": 0,
        "sgstAmount": 0,
        "igstAmount": 0,
        "cgst": 0,
        "sgst": 0,
        "igst": 0,
        "roundOff": 0,
        "grandTotal": float(batch.sale_rate),
        "paymentMode": "cash",
        "cashPaid": float(batch.sale_rate),
        "upiPaid": 0,
        "cardPaid": 0,
        "creditGiven": 0
    }

    response = client.post('/api/v1/sales/', data=json.dumps(payload), content_type='application/json')
    
    print('Response status:', response.status_code)
    if response.status_code != 201:
        print('Response data:', response.content)

    print('Total entries after:', StockLedger.objects.count())

run()
