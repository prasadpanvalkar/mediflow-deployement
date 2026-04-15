from rest_framework import serializers
from .models import SaleItem, SaleInvoice
from .utils.pricing import validate_sale_price
from apps.inventory.models import Batch

class SaleItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = SaleItem
        fields = '__all__'

    def validate(self, data):
        # Support either rate or sale_rate from payload depending on fields
        sale_rate = data.get('rate') or data.get('sale_rate')
        batch = data.get('batch')
        
        # Get pharmacy_id from context (e.g., from viewset)
        request = self.context.get('request')
        pharmacy_id = None
        
        # Determine pharmacy_id structure based on user model/view structure
        if request and hasattr(request, 'user'):
            if hasattr(request.user, 'pharmacy_id'):
                pharmacy_id = request.user.pharmacy_id
            elif hasattr(request.user, 'outlet_id'):
                pharmacy_id = request.user.outlet_id
            
        # Fallback if provided explicitly in data instead
        if not pharmacy_id and request and 'outletId' in request.data:
            pharmacy_id = request.data['outletId']

        if sale_rate and batch and pharmacy_id:
            # If batch is an ID and not an object yet, get the object
            if not isinstance(batch, Batch):
                try:
                    batch = Batch.objects.get(id=batch)
                except Batch.DoesNotExist:
                    raise serializers.ValidationError({"batch": "Invalid batch ID"})

            result = validate_sale_price(sale_rate, batch, pharmacy_id)
            if result.get('block'):
                raise serializers.ValidationError({
                    'sale_rate': result['message'],
                    'landing_cost': str(result['landing_cost']),
                    'mrp': str(result['mrp'])
                })
        return data

class SaleInvoiceSerializer(serializers.ModelSerializer):
    items = SaleItemSerializer(many=True, required=False)

    class Meta:
        model = SaleInvoice
        fields = '__all__'

    def create(self, validated_data):
        # To be implemented when moving away from raw views to viewsets
        items_data = validated_data.pop('items', [])
        invoice = SaleInvoice.objects.create(**validated_data)
        for item_data in items_data:
            SaleItem.objects.create(invoice=invoice, **item_data)
        return invoice
