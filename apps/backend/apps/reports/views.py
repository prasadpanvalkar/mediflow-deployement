import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from apps.core.permissions import IsAdminStaff
from rest_framework import status
from django.db.models import Sum, Count, Q
from datetime import datetime
from datetime import datetime, date

from django.db.models import F
from apps.billing.models import SaleInvoice, SaleItem
from apps.core.models import Outlet
from apps.inventory.models import Batch
from apps.purchases.models import PurchaseInvoice, Distributor
from apps.accounts.models import Customer

logger = logging.getLogger(__name__)


def split_gst(gst_amount, outlet_gstin, party_gstin):
    """
    Compute CGST/SGST/IGST split based on inter-state logic.
    """
    outlet_gstin = outlet_gstin or ''
    party_gstin = party_gstin or ''
    
    if party_gstin and outlet_gstin and party_gstin[:2] != outlet_gstin[:2]:
        # Inter-state
        return {'cgst': 0, 'sgst': 0, 'igst': gst_amount}
    else:
        # Intra-state
        half = round(gst_amount / 2, 2)
        return {'cgst': half, 'sgst': half, 'igst': 0}


class SalesDailyReportView(APIView):
    """
    GET /api/v1/reports/sales/daily/?outletId=xxx&date=YYYY-MM-DD

    Get daily sales report with summary cards and chart data.
    """

    permission_classes = [IsAdminStaff]

    def get(self, request, *args, **kwargs):
        """
        Get daily sales report.

        Query parameters:
        - outletId: Outlet UUID to filter invoices (required)
        - date: Report date in YYYY-MM-DD format (default: today)

        Returns:
        {
            "rows": [{ "date", "invoiceCount", "totalSales", "totalDiscount", "totalTax", "paymentBreakdown": { "cash", "upi", "card", "credit" } }],
            "summary": [{ "label", "value", "change", "trend" }],
            "chartData": [{ "date", "sales", "bills" }]
        }
        """

        outlet_id = request.query_params.get('outletId')
        date_str = request.query_params.get('date')

        # Validate outlet
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Parse date (default to today)
        if date_str:
            try:
                target_date = datetime.strptime(date_str, '%Y-%m-%d').date()
            except ValueError:
                return Response(
                    {'detail': 'Invalid date format. Use YYYY-MM-DD'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        else:
            target_date = datetime.now().date()

        logger.info(f"Generating daily sales report for {outlet.name} on {target_date}")

        # Query sales for the target date
        invoices = SaleInvoice.objects.filter(
            outlet=outlet,
            invoice_date__date=target_date
        )

        # Calculate aggregates
        total_invoices = invoices.count()
        total_sales = invoices.aggregate(total=Sum('grand_total'))['total'] or 0
        total_discount = invoices.aggregate(total=Sum('discount_amount'))['total'] or 0

        # Calculate total tax (CGST + SGST + IGST)
        cgst_total = invoices.aggregate(total=Sum('cgst_amount'))['total'] or 0
        sgst_total = invoices.aggregate(total=Sum('sgst_amount'))['total'] or 0
        igst_total = invoices.aggregate(total=Sum('igst_amount'))['total'] or 0
        total_tax = cgst_total + sgst_total + igst_total

        # Payment breakdown
        payment_breakdown = {
            'cash': float(invoices.filter(payment_mode='cash').aggregate(total=Sum('grand_total'))['total'] or 0),
            'upi': float(invoices.filter(payment_mode='upi').aggregate(total=Sum('grand_total'))['total'] or 0),
            'card': float(invoices.filter(payment_mode='card').aggregate(total=Sum('grand_total'))['total'] or 0),
            'credit': float(invoices.filter(payment_mode='credit').aggregate(total=Sum('grand_total'))['total'] or 0),
        }

        # Build rows (single row for single day report)
        rows = [{
            'date': target_date.isoformat(),
            'invoiceCount': total_invoices,
            'totalSales': float(total_sales),
            'totalDiscount': float(total_discount),
            'totalTax': float(total_tax),
            'paymentBreakdown': payment_breakdown,
        }]

        # Summary cards
        avg_bill_value = float(total_sales / total_invoices) if total_invoices > 0 else 0

        summary = [
            {
                'label': 'Total Sales',
                'value': f'₹{total_sales:,.0f}',
                'change': 0,  # No comparison available for single day
                'trend': 'neutral',
            },
            {
                'label': 'Total Bills',
                'value': str(total_invoices),
                'change': 0,
                'trend': 'neutral',
            },
            {
                'label': 'Avg Bill Value',
                'value': f'₹{avg_bill_value:,.0f}',
                'change': 0,
                'trend': 'neutral',
            },
            {
                'label': 'GST Collected',
                'value': f'₹{total_tax:,.0f}',
                'change': 0,
                'trend': 'neutral',
            },
            {
                'label': 'Total Discount',
                'value': f'₹{total_discount:,.0f}',
                'change': 0,
                'trend': 'neutral',
            },
        ]

        # Chart data (single data point for single day)
        chart_data = [{
            'date': target_date.isoformat(),
            'sales': float(total_sales),
            'bills': total_invoices,
        }]

        result = {
            'rows': rows,
            'summary': summary,
            'chartData': chart_data,
        }

        logger.info(f"Daily report: {total_invoices} bills, ₹{total_sales} sales")
        return Response(result, status=status.HTTP_200_OK)


class GSTR1ReportView(APIView):
    """
    GET /api/v1/reports/gst/gstr1/?from=YYYY-MM-DD&to=YYYY-MM-DD&outletId=xxx

    Generate GSTR-1 compatible GST summary grouped by HSN code.
    Matches the GSTSummary + GSTReportRow TypeScript interfaces exactly.
    """

    permission_classes = [IsAdminStaff]

    def get(self, request, *args, **kwargs):
        outlet_id = request.query_params.get('outletId')
        from_str = request.query_params.get('from')
        to_str = request.query_params.get('to')

        # Validate outlet
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Parse date range
        try:
            from_date = datetime.strptime(from_str, '%Y-%m-%d').date()
            to_date = datetime.strptime(to_str, '%Y-%m-%d').date()
        except (ValueError, TypeError):
            return Response(
                {'detail': 'Invalid date format. Use YYYY-MM-DD for `from` and `to`.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        logger.info(f"Generating GSTR-1 for {outlet.name} from {from_date} to {to_date}")

        # Fetch all sale items in the date range for this outlet (excluding returns)
        sale_items = SaleItem.objects.filter(
            invoice__outlet=outlet,
            invoice__invoice_date__date__range=(from_date, to_date),
            qty_strips__gt=0,  # exclude returns (negative qty)
        ).select_related('batch__product', 'invoice', 'invoice__customer')

        # Group by HSN code
        hsn_groups: dict = {}
        outlet_gstin = outlet.gstin
        for item in sale_items:
            hsn_code = (
                item.batch.product.hsn_code
                if item.batch and item.batch.product
                else 'UNKNOWN'
            )
            product_name = item.product_name
            gst_rate = float(item.gst_rate)

            if hsn_code not in hsn_groups:
                hsn_groups[hsn_code] = {
                    'hsnCode': hsn_code,
                    'productName': product_name,
                    'gstRate': gst_rate,
                    'taxableAmount': 0.0,
                    'cgstRate': gst_rate / 2,
                    'cgstAmount': 0.0,
                    'sgstRate': gst_rate / 2,
                    'sgstAmount': 0.0,
                    'igstRate': gst_rate,
                    'igstAmount': 0.0,
                    'totalTax': 0.0,
                    'totalAmount': 0.0,
                }

            taxable = float(item.taxable_amount)
            gst_amt = float(item.gst_amount)
            
            customer_gstin = item.invoice.customer.gstin if item.invoice.customer else None
            split = split_gst(gst_amt, outlet_gstin, customer_gstin)
            
            total = float(item.total_amount)

            hsn_groups[hsn_code]['taxableAmount'] += taxable
            hsn_groups[hsn_code]['cgstAmount'] += split['cgst']
            hsn_groups[hsn_code]['sgstAmount'] += split['sgst']
            hsn_groups[hsn_code]['igstAmount'] += split['igst']
            hsn_groups[hsn_code]['totalTax'] += gst_amt
            hsn_groups[hsn_code]['totalAmount'] += total

        # Round all values to 2 decimal places
        rows = []
        for row in hsn_groups.values():
            rows.append({
                'hsnCode': row['hsnCode'],
                'productName': row['productName'],
                'taxableAmount': round(row['taxableAmount'], 2),
                'cgstRate': round(row['cgstRate'], 2),
                'cgstAmount': round(row['cgstAmount'], 2),
                'sgstRate': round(row['sgstRate'], 2),
                'sgstAmount': round(row['sgstAmount'], 2),
                'igstRate': round(row['igstRate'], 2),
                'igstAmount': round(row['igstAmount'], 2),
                'totalTax': round(row['totalTax'], 2),
                'totalAmount': round(row['totalAmount'], 2),
            })

        # Compute grand totals
        total_taxable = round(sum(r['taxableAmount'] for r in rows), 2)
        total_cgst = round(sum(r['cgstAmount'] for r in rows), 2)
        total_sgst = round(sum(r['sgstAmount'] for r in rows), 2)
        total_igst = round(sum(r['igstAmount'] for r in rows), 2)
        total_tax = round(sum(r['totalTax'] for r in rows), 2)
        grand_total = round(sum(r['totalAmount'] for r in rows), 2)

        # Build GST rate slab breakup
        slab_map: dict = {}
        for row in rows:
            rate = row['cgstRate'] + row['sgstRate'] + row['igstRate']
            if rate not in slab_map:
                slab_map[rate] = {'rate': rate, 'taxableAmount': 0.0, 'taxAmount': 0.0}
            slab_map[rate]['taxableAmount'] += row['taxableAmount']
            slab_map[rate]['taxAmount'] += row['totalTax']
        gst_slab_breakup = [
            {
                'rate': round(s['rate'], 2),
                'taxableAmount': round(s['taxableAmount'], 2),
                'taxAmount': round(s['taxAmount'], 2),
            }
            for s in slab_map.values()
        ]

        result = {
            'period': {
                'from': from_date.isoformat(),
                'to': to_date.isoformat(),
                'period': 'custom',
            },
            'outletGstin': outlet.gstin or '',
            'outletName': outlet.name,
            'rows': rows,
            'totals': {
                'taxableAmount': total_taxable,
                'cgstAmount': total_cgst,
                'sgstAmount': total_sgst,
                'igstAmount': total_igst,
                'totalTax': total_tax,
                'totalAmount': grand_total,
            },
            'gstSlabBreakup': gst_slab_breakup,
        }

        logger.info(f"GSTR-1 report: {len(rows)} HSN groups, ₹{grand_total} total")
        return Response(result, status=status.HTTP_200_OK)


class SalesSummaryReportView(APIView):
    """GET /api/v1/reports/sales/summary/?from=&to="""
    permission_classes = [IsAdminStaff]

    def get(self, request, *args, **kwargs):
        from django.db.models import Avg, F
        outlet_id = request.query_params.get('outletId')
        from_str = request.query_params.get('from')
        to_str = request.query_params.get('to')

        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        qs = SaleInvoice.objects.filter(outlet=outlet, is_return=False)
        if from_str:
            try:
                qs = qs.filter(invoice_date__date__gte=datetime.strptime(from_str, '%Y-%m-%d').date())
            except ValueError:
                pass
        if to_str:
            try:
                qs = qs.filter(invoice_date__date__lte=datetime.strptime(to_str, '%Y-%m-%d').date())
            except ValueError:
                pass

        totals = qs.aggregate(
            total_sales=Sum('grand_total'),
            total_invoices=Count('id'),
            total_discount=Sum('discount_amount'),
            total_cgst=Sum('cgst_amount'),
            total_sgst=Sum('sgst_amount'),
            total_igst=Sum('igst_amount'),
            total_cash=Sum('cash_paid'),
            total_upi=Sum('upi_paid'),
            total_card=Sum('card_paid'),
            total_credit=Sum('credit_given'),
        )

        total_invoices = totals['total_invoices'] or 0
        total_sales = float(totals['total_sales'] or 0)
        total_gst = float((totals['total_cgst'] or 0) + (totals['total_sgst'] or 0) + (totals['total_igst'] or 0))
        avg_invoice = total_sales / total_invoices if total_invoices > 0 else 0

        # By day
        from django.db.models.functions import TruncDate
        by_day_qs = qs.annotate(day=TruncDate('invoice_date')).values('day').annotate(
            totalSales=Sum('grand_total'),
            invoiceCount=Count('id'),
        ).order_by('day')
        by_day = [{'date': row['day'].isoformat(), 'totalSales': float(row['totalSales'] or 0), 'invoiceCount': row['invoiceCount']} for row in by_day_qs]

        # Top products
        from apps.billing.models import SaleItem
        top_products_qs = SaleItem.objects.filter(
            invoice__in=qs
        ).values('product_name').annotate(
            qty=Sum('qty_strips'),
            totalAmount=Sum('total_amount'),
        ).order_by('-totalAmount')[:10]
        top_products = [{'productName': r['product_name'], 'qty': r['qty'], 'totalAmount': float(r['totalAmount'] or 0)} for r in top_products_qs]

        # Top staff
        from apps.accounts.models import Staff
        top_staff_qs = qs.values('billed_by__name').annotate(
            invoiceCount=Count('id'),
            totalAmount=Sum('grand_total'),
        ).order_by('-totalAmount')[:10]
        top_staff = [{'staffName': r['billed_by__name'] or 'Unknown', 'invoiceCount': r['invoiceCount'], 'totalAmount': float(r['totalAmount'] or 0)} for r in top_staff_qs]

        data = {
            'totalSales': total_sales,
            'totalInvoices': total_invoices,
            'totalDiscount': float(totals['total_discount'] or 0),
            'totalGST': total_gst,
            'totalCashSales': float(totals['total_cash'] or 0),
            'totalUpiSales': float(totals['total_upi'] or 0),
            'totalCardSales': float(totals['total_card'] or 0),
            'totalCreditSales': float(totals['total_credit'] or 0),
            'avgInvoiceValue': round(avg_invoice, 2),
            'byDay': by_day,
            'topProducts': top_products,
            'topStaff': top_staff,
        }

        return Response({'success': True, 'data': data}, status=status.HTTP_200_OK)


class GSTR2ReportView(APIView):
    """GET /api/v1/reports/gst/gstr2/?from=&to="""
    permission_classes = [IsAdminStaff]

    def get(self, request, *args, **kwargs):
        from apps.purchases.models import PurchaseInvoice, PurchaseItem
        outlet_id = request.query_params.get('outletId')
        from_str = request.query_params.get('from')
        to_str = request.query_params.get('to')

        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        qs = PurchaseInvoice.objects.filter(outlet=outlet).select_related('distributor')
        if from_str:
            try:
                qs = qs.filter(invoice_date__gte=datetime.strptime(from_str, '%Y-%m-%d').date())
            except ValueError:
                pass
        if to_str:
            try:
                qs = qs.filter(invoice_date__lte=datetime.strptime(to_str, '%Y-%m-%d').date())
            except ValueError:
                pass

        rows = []
        total_taxable = total_cgst = total_sgst = total_igst = total_cess = total_amount = 0.0
        outlet_gstin = outlet.gstin
        for inv in qs:
            gst = float(inv.gst_amount)
            distributor_gstin = inv.distributor.gstin if inv.distributor else None
            split = split_gst(gst, outlet_gstin, distributor_gstin)

            taxable = float(inv.taxable_amount)
            cess = float(inv.cess_amount)
            grand = float(inv.grand_total)

            rows.append({
                'distributorName': inv.distributor.name,
                'distributorGSTIN': distributor_gstin or '',
                'invoiceNo': inv.invoice_no,
                'invoiceDate': inv.invoice_date.isoformat(),
                'taxableAmount': taxable,
                'cgstAmount': split['cgst'],
                'sgstAmount': split['sgst'],
                'igstAmount': split['igst'],
                'cessAmount': cess,
                'totalAmount': grand,
            })
            total_taxable += taxable
            total_cgst += split['cgst']
            total_sgst += split['sgst']
            total_igst += split['igst']
            total_cess += cess
            total_amount += grand

        period = f"{from_str or ''} to {to_str or ''}"
        return Response({
            'success': True,
            'data': {
                'period': period,
                'rows': rows,
                'summary': {
                    'totalTaxable': round(total_taxable, 2),
                    'totalCGST': round(total_cgst, 2),
                    'totalSGST': round(total_sgst, 2),
                    'totalIGST': round(total_igst, 2),
                    'totalCess': round(total_cess, 2),
                    'grandTotal': round(total_amount, 2),
                },
            }
        }, status=status.HTTP_200_OK)


class GSTR3BReportView(APIView):
    """GET /api/v1/reports/gst/gstr3b/?month=2026-03"""
    permission_classes = [IsAdminStaff]

    def get(self, request, *args, **kwargs):
        from apps.purchases.models import PurchaseInvoice
        outlet_id = request.query_params.get('outletId')
        month_str = request.query_params.get('month')

        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        if not month_str:
            return Response({'detail': 'month parameter required (format: YYYY-MM)'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            year, month = int(month_str.split('-')[0]), int(month_str.split('-')[1])
        except (ValueError, IndexError):
            return Response({'detail': 'Invalid month format. Use YYYY-MM'}, status=status.HTTP_400_BAD_REQUEST)

        # Outward supplies (GSTR-1 style)
        sales_qs = SaleInvoice.objects.filter(
            outlet=outlet,
            invoice_date__year=year,
            invoice_date__month=month,
            is_return=False,
        ).aggregate(
            taxable=Sum('taxable_amount'),
            cgst=Sum('cgst_amount'),
            sgst=Sum('sgst_amount'),
            igst=Sum('igst_amount'),
        )

        # Inward supplies (GSTR-2 style)
        purchases_qs = PurchaseInvoice.objects.filter(
            outlet=outlet,
            invoice_date__year=year,
            invoice_date__month=month,
        ).aggregate(
            taxable=Sum('taxable_amount'),
            gst=Sum('gst_amount'),
            cess=Sum('cess_amount'),
        )

        out_taxable = float(sales_qs['taxable'] or 0)
        out_cgst = float(sales_qs['cgst'] or 0)
        out_sgst = float(sales_qs['sgst'] or 0)
        out_igst = float(sales_qs['igst'] or 0)

        in_taxable = float(purchases_qs['taxable'] or 0)
        in_gst = float(purchases_qs['gst'] or 0)
        in_cgst = round(in_gst / 2, 2)
        in_sgst = round(in_gst / 2, 2)
        in_cess = float(purchases_qs['cess'] or 0)

        net_cgst = round(out_cgst - in_cgst, 2)
        net_sgst = round(out_sgst - in_sgst, 2)
        net_igst = round(out_igst, 2)

        return Response({
            'success': True,
            'data': {
                'month': month_str,
                'outwardSupplies': {'taxableValue': out_taxable, 'cgst': out_cgst, 'sgst': out_sgst, 'igst': out_igst, 'cess': 0},
                'inwardSupplies': {'taxableValue': in_taxable, 'cgst': in_cgst, 'sgst': in_sgst, 'igst': 0, 'cess': in_cess},
                'netTaxLiability': {'cgst': out_cgst, 'sgst': out_sgst, 'igst': out_igst, 'cess': 0, 'total': round(out_cgst + out_sgst + out_igst, 2)},
                'inputTaxCredit': {'cgst': in_cgst, 'sgst': in_sgst, 'igst': 0, 'cess': in_cess, 'total': round(in_cgst + in_sgst + in_cess, 2)},
                'netPayable': {'cgst': max(0, net_cgst), 'sgst': max(0, net_sgst), 'igst': max(0, net_igst), 'cess': 0, 'total': round(max(0, net_cgst) + max(0, net_sgst) + max(0, net_igst), 2)},
            }
        }, status=status.HTTP_200_OK)


class InventoryValuationView(APIView):
    """GET /api/v1/reports/inventory/valuation/"""
    permission_classes = [IsAdminStaff]

    def get(self, request, *args, **kwargs):
        from apps.inventory.models import Batch, MasterProduct
        outlet_id = request.query_params.get('outletId')

        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        batches = Batch.objects.filter(
            outlet=outlet,
            qty_strips__gt=0,
            is_active=True,
        ).select_related('product').order_by('product__name', 'expiry_date')

        # Group by product
        product_map = {}
        for batch in batches:
            product = batch.product
            if product is None:
                continue
            pid = str(product.id)
            if pid not in product_map:
                product_map[pid] = {
                    'productId': pid,
                    'productName': product.name,
                    'genericName': product.composition,
                    'manufacturer': product.manufacturer,
                    'totalQty': 0,
                    'totalValuation': 0.0,
                    'purchaseRates': [],
                    'mrp': float(batch.mrp),
                    'batches': [],
                }
            batch_val = float(batch.qty_strips * batch.purchase_rate)
            product_map[pid]['totalQty'] += batch.qty_strips
            product_map[pid]['totalValuation'] += batch_val
            product_map[pid]['purchaseRates'].append(float(batch.purchase_rate))
            product_map[pid]['mrp'] = float(batch.mrp)
            product_map[pid]['batches'].append({
                'batchNo': batch.batch_no,
                'expiryDate': batch.expiry_date.isoformat(),
                'qty': batch.qty_strips,
                'purchaseRate': float(batch.purchase_rate),
                'valuation': round(batch_val, 2),
            })

        products = []
        total_valuation = 0.0
        for p in product_map.values():
            avg_rate = sum(p['purchaseRates']) / len(p['purchaseRates']) if p['purchaseRates'] else 0
            p['avgPurchaseRate'] = round(avg_rate, 2)
            p['valuationAmount'] = round(p['totalValuation'], 2)
            del p['purchaseRates']
            del p['totalValuation']
            total_valuation += p['valuationAmount']
            products.append(p)

        return Response({
            'success': True,
            'data': {
                'totalValuation': round(total_valuation, 2),
                'totalProducts': len(products),
                'products': products,
            },
            'meta': {
                'generatedAt': date.today().isoformat(),
                'outletId': outlet_id,
            }
        }, status=status.HTTP_200_OK)


class InventoryMovementReportView(APIView):
    """GET /api/v1/reports/inventory/movement/?productId=&from=&to="""
    permission_classes = [IsAdminStaff]

    def get(self, request, *args, **kwargs):
        from apps.inventory.models import Batch, MasterProduct
        from apps.purchases.models import PurchaseItem
        from apps.billing.models import SaleItem, SalesReturnItem

        outlet_id = request.query_params.get('outletId')
        product_id = request.query_params.get('productId')
        from_str = request.query_params.get('from')
        to_str = request.query_params.get('to')

        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        try:
            product = MasterProduct.objects.get(id=product_id)
        except MasterProduct.DoesNotExist:
            return Response({'detail': 'Product not found'}, status=status.HTTP_404_NOT_FOUND)

        from_date = None
        to_date = None
        if from_str:
            try:
                from_date = datetime.strptime(from_str, '%Y-%m-%d').date()
            except ValueError:
                pass
        if to_str:
            try:
                to_date = datetime.strptime(to_str, '%Y-%m-%d').date()
            except ValueError:
                pass

        # Get all batches for opening stock calc
        batches_qs = Batch.objects.filter(outlet=outlet, product=product)
        opening_stock = sum(b.qty_strips for b in batches_qs)
        closing_stock = opening_stock  # Will adjust below

        movements = []

        # Purchases
        purchase_items = PurchaseItem.objects.filter(
            invoice__outlet=outlet,
            master_product=product,
        ).select_related('invoice__distributor')
        if from_date:
            purchase_items = purchase_items.filter(invoice__invoice_date__gte=from_date)
        if to_date:
            purchase_items = purchase_items.filter(invoice__invoice_date__lte=to_date)

        for pi in purchase_items:
            movements.append({
                'date': pi.invoice.invoice_date.isoformat(),
                'type': 'purchase',
                'referenceNo': pi.invoice.invoice_no,
                'partyName': pi.invoice.distributor.name,
                'batchNo': pi.batch_no,
                'qtyIn': pi.actual_qty,
                'qtyOut': 0,
                'balanceAfter': None,
            })

        # Sales
        sale_items = SaleItem.objects.filter(
            invoice__outlet=outlet,
            batch__product=product,
        ).select_related('invoice__customer')
        if from_date:
            sale_items = sale_items.filter(invoice__invoice_date__date__gte=from_date)
        if to_date:
            sale_items = sale_items.filter(invoice__invoice_date__date__lte=to_date)

        for si in sale_items:
            movements.append({
                'date': si.invoice.invoice_date.date().isoformat(),
                'type': 'sale',
                'referenceNo': si.invoice.invoice_no,
                'partyName': si.invoice.customer.name if si.invoice.customer else 'Walk-in',
                'batchNo': si.batch_no,
                'qtyIn': 0,
                'qtyOut': abs(si.qty_strips),
                'balanceAfter': None,
            })

        # Sort by date
        movements.sort(key=lambda x: x['date'])

        # Calculate running balance
        balance = opening_stock
        for m in movements:
            balance = balance + m['qtyIn'] - m['qtyOut']
            m['balanceAfter'] = balance
        closing_stock = balance

        return Response({
            'success': True,
            'data': {
                'productId': str(product.id),
                'productName': product.name,
                'genericName': product.composition,
                'openingStock': opening_stock,
                'closingStock': closing_stock,
                'movements': movements,
            }
        }, status=status.HTTP_200_OK)


class ExpiryReportView(APIView):
    """GET /api/v1/reports/expiry/?days=30"""
    permission_classes = [IsAdminStaff]

    def get(self, request, *args, **kwargs):
        from apps.inventory.models import Batch
        outlet_id = request.query_params.get('outletId')
        days = int(request.query_params.get('days', 30))

        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        today = date.today()
        cutoff = today + __import__('datetime').timedelta(days=days)

        batches = Batch.objects.filter(
            outlet=outlet,
            qty_strips__gt=0,
            is_active=True,
            expiry_date__lte=cutoff,
        ).select_related('product').order_by('expiry_date')

        product_map = {}
        total_stock = 0
        for batch in batches:
            pid = str(batch.product.id)
            if pid not in product_map:
                product_map[pid] = {
                    'productId': pid,
                    'productName': batch.product.name,
                    'genericName': batch.product.composition,
                    'manufacturer': batch.product.manufacturer,
                    'batches': [],
                }
            days_to_expiry = (batch.expiry_date - today).days
            valuation = float(batch.qty_strips * batch.purchase_rate)
            total_stock += batch.qty_strips
            product_map[pid]['batches'].append({
                'batchNo': batch.batch_no,
                'expiryDate': batch.expiry_date.isoformat(),
                'daysToExpiry': days_to_expiry,
                'qtyStrips': batch.qty_strips,
                'mrp': float(batch.mrp),
                'purchaseRate': float(batch.purchase_rate),
                'valuationAtRisk': round(valuation, 2),
            })

        products = list(product_map.values())
        total_batches = sum(len(p['batches']) for p in products)

        return Response({
            'success': True,
            'data': {
                'totalBatches': total_batches,
                'totalProducts': len(products),
                'totalStockAtRisk': total_stock,
                'products': products,
            },
            'meta': {'generatedAt': today.isoformat(), 'daysFilter': days},
        }, status=status.HTTP_200_OK)


class StaffPerformanceReportView(APIView):
    """GET /api/v1/reports/staff/performance/?from=&to="""
    permission_classes = [IsAdminStaff]

    def get(self, request, *args, **kwargs):
        from apps.accounts.models import Staff
        from django.db.models.functions import TruncDate
        outlet_id = request.query_params.get('outletId')
        from_str = request.query_params.get('from')
        to_str = request.query_params.get('to')

        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        staff_members = Staff.objects.filter(outlet=outlet, is_active=True)
        data = []
        for staff in staff_members:
            qs = SaleInvoice.objects.filter(outlet=outlet, billed_by=staff, is_return=False)
            if from_str:
                try:
                    qs = qs.filter(invoice_date__date__gte=datetime.strptime(from_str, '%Y-%m-%d').date())
                except ValueError:
                    pass
            if to_str:
                try:
                    qs = qs.filter(invoice_date__date__lte=datetime.strptime(to_str, '%Y-%m-%d').date())
                except ValueError:
                    pass

            agg = qs.aggregate(
                total_invoices=Count('id'),
                total_sales=Sum('grand_total'),
                total_discount=Sum('discount_amount'),
            )
            total_invoices = agg['total_invoices'] or 0
            total_sales = float(agg['total_sales'] or 0)
            total_discount = float(agg['total_discount'] or 0)
            avg_val = total_sales / total_invoices if total_invoices > 0 else 0
            avg_disc_pct = (total_discount / total_sales * 100) if total_sales > 0 else 0

            by_day = list(
                qs.annotate(day=TruncDate('invoice_date'))
                .values('day')
                .annotate(invoiceCount=Count('id'), totalAmount=Sum('grand_total'))
                .order_by('day')
            )

            data.append({
                'staffId': str(staff.id),
                'staffName': staff.name,
                'role': staff.role,
                'totalInvoices': total_invoices,
                'totalSalesAmount': total_sales,
                'totalDiscountGiven': total_discount,
                'avgInvoiceValue': round(avg_val, 2),
                'avgDiscountPct': round(avg_disc_pct, 2),
                'salesByDay': [{'date': r['day'].isoformat(), 'invoiceCount': r['invoiceCount'], 'totalAmount': float(r['totalAmount'] or 0)} for r in by_day],
            })

        top_performer = max(data, key=lambda x: x['totalSalesAmount'])['staffName'] if data else None
        return Response({
            'success': True,
            'data': data,
            'meta': {'from': from_str, 'to': to_str, 'topPerformer': top_performer},
        }, status=status.HTTP_200_OK)


class BalanceSheetView(APIView):
    """
    GET /api/v1/reports/balance-sheet/?outletId=xxx

    Snapshot balance sheet: Assets (stock + receivables) vs Liabilities (payables).
    """

    permission_classes = [IsAdminStaff]

    def get(self, request):
        outlet_id = request.GET.get('outletId') or str(request.user.outlet_id)

        # ── ASSETS ──────────────────────────────────────────────────────────────
        from apps.inventory.models import Batch
        from apps.accounts.models import Ledger
        from decimal import Decimal

        # 1. Stock value at purchase rate (qty_strips × purchase_rate per batch)
        stock_value = (
            Batch.objects.filter(outlet_id=outlet_id, qty_strips__gt=0, is_active=True)
            .aggregate(total=Sum(F('qty_strips') * F('purchase_rate')))['total'] or 0
        )

        ledgers = Ledger.objects.filter(outlet_id=outlet_id).select_related('group')
        
        receivables = Decimal('0')
        cash_and_bank = Decimal('0')
        payables = Decimal('0')
        other_assets = Decimal('0')
        other_liabilities = Decimal('0')
        
        for ledger in ledgers:
            bal = ledger.current_balance
            if ledger.group.nature == 'asset':
                if bal >= 0:
                    if ledger.group.name == 'Sundry Debtors':
                        receivables += bal
                    elif ledger.group.name in ['Cash in Hand', 'Bank Accounts']:
                        cash_and_bank += bal
                    else:
                        other_assets += bal
                else:
                    # Negative asset = liability
                    other_liabilities += abs(bal)
            elif ledger.group.nature == 'liability':
                if bal >= 0:
                    if ledger.group.name == 'Sundry Creditors':
                        payables += bal
                    else:
                        other_liabilities += bal
                else:
                    # Negative liability = asset
                    other_assets += abs(bal)

        total_assets = float(stock_value) + float(receivables) + float(cash_and_bank) + float(other_assets)
        total_liabilities = float(payables) + float(other_liabilities)
        net_worth = total_assets - total_liabilities

        # ── Breakdown details ────────────────────────────────────────────────────
        batch_count = Batch.objects.filter(outlet_id=outlet_id, qty_strips__gt=0, is_active=True).count()
        customer_count = Ledger.objects.filter(outlet_id=outlet_id, group__name='Sundry Debtors', current_balance__gt=0).count()
        distributor_count = Ledger.objects.filter(outlet_id=outlet_id, group__name='Sundry Creditors', current_balance__gt=0).count()

        return Response({
            'success': True,
            'data': {
                'asOfDate': date.today().isoformat(),
                'assets': {
                    'currentStock': float(stock_value),
                    'receivables': float(receivables),
                    'cashAndBank': float(cash_and_bank),
                    'otherAssets': float(other_assets),
                    'totalAssets': round(total_assets, 2),
                    'breakdown': {
                        'batchCount': batch_count,
                        'customersWithOutstanding': customer_count,
                    },
                },
                'liabilities': {
                    'payables': float(payables),
                    'otherLiabilities': float(other_liabilities),
                    'totalLiabilities': round(total_liabilities, 2),
                    'breakdown': {
                        'distributorsWithOutstanding': distributor_count,
                    },
                },
                'netWorth': round(net_worth, 2),
            }
        }, status=status.HTTP_200_OK)


class GSTR2AReconciliationView(APIView):
    """
    POST /api/v1/reports/gstr2a/

    Body: { "gstin": "27ABC123", "from": "2026-01-01", "to": "2026-03-31" }

    Reconcile our purchase invoices against GSTR-2A data.
    Phase 3: uses mock GSTR-2A data. Phase 4 will wire real GSTN API.
    """

    permission_classes = [IsAdminStaff]

    def post(self, request):
        gstin = request.data.get('gstin', '')
        from_date = request.data.get('from', '')
        to_date = request.data.get('to', '')

        if not all([gstin, from_date, to_date]):
            return Response(
                {'success': False, 'error': 'gstin, from, and to are required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Our purchase invoices for the outlet whose GSTIN matches
        our_invoices_qs = PurchaseInvoice.objects.filter(
            outlet__gstin=gstin,
            invoice_date__gte=from_date,
            invoice_date__lte=to_date,
        ).select_related('distributor').order_by('invoice_date')

        our_invoices = [
            {
                'supplierGstin': inv.distributor.gstin or '',
                'supplierName': inv.distributor.name,
                'invoiceNo': inv.invoice_no,
                'invoiceDate': inv.invoice_date.isoformat(),
                'totalAmount': float(inv.grand_total),
                'gstAmount': float(inv.gst_amount),
            }
            for inv in our_invoices_qs
        ]

        # ── Mock GSTR-2A data (Phase 4 will call GSTN API) ──────────────────────
        # In production this comes from: https://api.gst.gov.in/taxpayerapi/v1.1/returns/gstr2a
        gstr2a_data = [
            {
                'supplierGstin': our_invoices[0]['supplierGstin'] if our_invoices else '27XYZ456ABC1Z5',
                'supplierName': our_invoices[0]['supplierName'] if our_invoices else 'Mock Supplier A',
                'invoiceNo': our_invoices[0]['invoiceNo'] if our_invoices else 'MOCK-001',
                'invoiceDate': our_invoices[0]['invoiceDate'] if our_invoices else from_date,
                'totalAmount': our_invoices[0]['totalAmount'] if our_invoices else 15000.0,
                'gstAmount': our_invoices[0]['gstAmount'] if our_invoices else 1350.0,
            },
            {
                'supplierGstin': '29DEF789GHI2Z3',
                'supplierName': 'Mock Pharma Distributor',
                'invoiceNo': 'GSTR2A-UNMATCHED-001',
                'invoiceDate': from_date,
                'totalAmount': 28500.0,
                'gstAmount': 2565.0,
            },
        ]

        # ── Reconciliation logic ──────────────────────────────────────────────────
        matched = []
        our_only = []
        gstr2a_only = []

        gstr2a_lookup = {
            (g['supplierGstin'], g['invoiceNo']): g
            for g in gstr2a_data
        }
        our_lookup = {
            (o['supplierGstin'], o['invoiceNo']): o
            for o in our_invoices
        }

        for key, our in our_lookup.items():
            if key in gstr2a_lookup:
                g = gstr2a_lookup[key]
                variance = round(float(our['totalAmount']) - float(g['totalAmount']), 2)
                matched.append({**our, 'gstr2aAmount': g['totalAmount'], 'variance': variance})
            else:
                our_only.append(our)

        for key, g in gstr2a_lookup.items():
            if key not in our_lookup:
                gstr2a_only.append(g)

        total_gstr2a = sum(float(g['totalAmount']) for g in gstr2a_data)
        total_ours = sum(float(o['totalAmount']) for o in our_invoices)
        total_variance = sum(abs(m['variance']) for m in matched)

        return Response({
            'success': True,
            'data': {
                'gstin': gstin,
                'period': {'from': from_date, 'to': to_date},
                'summary': {
                    'ourInvoices': len(our_invoices),
                    'gstr2aInvoices': len(gstr2a_data),
                    'matched': len(matched),
                    'ourOnly': len(our_only),
                    'gstr2aOnly': len(gstr2a_only),
                    'totalOurAmount': round(total_ours, 2),
                    'totalGstr2aAmount': round(total_gstr2a, 2),
                    'totalVariance': round(total_variance, 2),
                },
                'matched': matched,
                'ourOnly': our_only,
                'gstr2aOnly': gstr2a_only,
                'note': 'GSTR-2A data is mocked. Phase 4 will integrate live GSTN API.',
            }
        }, status=status.HTTP_200_OK)
