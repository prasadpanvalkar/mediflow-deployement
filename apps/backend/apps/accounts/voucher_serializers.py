from rest_framework import serializers
from apps.accounts.models import (
    LedgerGroup, Ledger, Voucher, VoucherLine,
    DebitNote, DebitNoteItem, CreditNote, CreditNoteItem,
)


class LedgerGroupSerializer(serializers.ModelSerializer):
    parentId = serializers.UUIDField(source='parent_id', allow_null=True, read_only=True)

    class Meta:
        model = LedgerGroup
        fields = ['id', 'name', 'nature', 'parentId', 'isSystem']

    def to_representation(self, instance):
        return {
            'id': str(instance.id),
            'name': instance.name,
            'nature': instance.nature,
            'parentId': str(instance.parent_id) if instance.parent_id else None,
            'isSystem': instance.is_system,
        }


class LedgerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ledger
        fields = '__all__'

    def to_representation(self, instance):
        return {
            'id': str(instance.id),
            'name': instance.name,
            'groupId': str(instance.group_id),
            'groupName': instance.group.name,
            'nature': instance.group.nature,
            'openingBalance': float(instance.opening_balance),
            'balanceType': instance.balance_type,
            'currentBalance': float(instance.current_balance),
            'phone': instance.phone,
            'gstin': instance.gstin,
            'address': instance.address,
            'linkedCustomerId': str(instance.linked_customer_id) if instance.linked_customer_id else None,
            'linkedDistributorId': str(instance.linked_distributor_id) if instance.linked_distributor_id else None,
            'isSystem': instance.is_system,
            'createdAt': instance.created_at.isoformat(),
        }


class VoucherLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = VoucherLine
        fields = ['id', 'ledger', 'debit', 'credit', 'description']

    def to_representation(self, instance):
        return {
            'id': str(instance.id),
            'ledgerId': str(instance.ledger_id),
            'ledgerName': instance.ledger.name,
            'debit': float(instance.debit),
            'credit': float(instance.credit),
            'description': instance.description,
        }


class VoucherSerializer(serializers.ModelSerializer):
    lines = VoucherLineSerializer(many=True, read_only=True)

    class Meta:
        model = Voucher
        fields = '__all__'

    def to_representation(self, instance):
        return {
            'id': str(instance.id),
            'voucherType': instance.voucher_type,
            'voucherNo': instance.voucher_no,
            'date': str(instance.date),
            'narration': instance.narration,
            'totalAmount': float(instance.total_amount),
            'paymentMode': instance.payment_mode,
            'lines': VoucherLineSerializer(instance.lines.all(), many=True).data,
            'createdBy': str(instance.created_by_id),
            'createdAt': instance.created_at.isoformat(),
        }


class DebitNoteItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = DebitNoteItem
        fields = '__all__'

    def to_representation(self, instance):
        return {
            'id': str(instance.id),
            'batchId': str(instance.batch_id),
            'productName': instance.product_name,
            'qty': float(instance.qty),
            'rate': float(instance.rate),
            'gstRate': float(instance.gst_rate),
            'total': float(instance.total),
        }


class DebitNoteSerializer(serializers.ModelSerializer):
    items = DebitNoteItemSerializer(many=True, read_only=True)

    class Meta:
        model = DebitNote
        fields = '__all__'

    def to_representation(self, instance):
        return {
            'id': str(instance.id),
            'debitNoteNo': instance.debit_note_no,
            'date': str(instance.date),
            'distributorId': str(instance.distributor_id),
            'distributorName': instance.distributor.name,
            'purchaseInvoiceId': str(instance.purchase_invoice_id) if instance.purchase_invoice_id else None,
            'reason': instance.reason,
            'subtotal': float(instance.subtotal),
            'gstAmount': float(instance.gst_amount),
            'totalAmount': float(instance.total_amount),
            'status': instance.status,
            'items': DebitNoteItemSerializer(instance.items.all(), many=True).data,
            'createdAt': instance.created_at.isoformat(),
        }


class CreditNoteItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = CreditNoteItem
        fields = '__all__'

    def to_representation(self, instance):
        return {
            'id': str(instance.id),
            'batchId': str(instance.batch_id),
            'productName': instance.product_name,
            'qty': float(instance.qty),
            'rate': float(instance.rate),
            'gstRate': float(instance.gst_rate),
            'total': float(instance.total),
        }


class CreditNoteSerializer(serializers.ModelSerializer):
    items = CreditNoteItemSerializer(many=True, read_only=True)

    class Meta:
        model = CreditNote
        fields = '__all__'

    def to_representation(self, instance):
        return {
            'id': str(instance.id),
            'creditNoteNo': instance.credit_note_no,
            'date': str(instance.date),
            'customerId': str(instance.customer_id) if instance.customer_id else None,
            'customerName': instance.customer.name if instance.customer_id else None,
            'saleInvoiceId': str(instance.sale_invoice_id) if instance.sale_invoice_id else None,
            'reason': instance.reason,
            'subtotal': float(instance.subtotal),
            'gstAmount': float(instance.gst_amount),
            'totalAmount': float(instance.total_amount),
            'status': instance.status,
            'items': CreditNoteItemSerializer(instance.items.all(), many=True).data,
            'createdAt': instance.created_at.isoformat(),
        }
