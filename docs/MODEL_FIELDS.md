## Organization (core)
| Field Name | Type | Required? | Default | Notes |
|---|---|---|---|---|
| id | UUIDField | No | uuid4 | auto-generated |
| name | CharField | Yes | | |
| slug | SlugField | Yes | | |
| plan | CharField | No | 'starter' | choices |
| master_gstin | CharField | No | '' | |
| phone | CharField | No | '' | |
| email | EmailField | No | '' | |
| is_active | BooleanField | No | True | |
| created_at | DateTimeField | No | | auto_now_add |

## Outlet (core)
| Field Name | Type | Required? | Default | Notes |
|---|---|---|---|---|
| id | UUIDField | No | uuid4 | auto-generated |
| organization | ForeignKey | Yes | | FK → Organization |
| name | CharField | Yes | | |
| address | TextField | Yes | | |
| city | CharField | Yes | | |
| state | CharField | Yes | | |
| state_code | CharField | No | '' | |
| pincode | CharField | Yes | | |
| gstin | CharField | Yes | | unique |
| drug_license_no | CharField | Yes | | unique |
| phone | CharField | Yes | | |
| logo_url | URLField | No | | |
| invoice_footer | TextField | No | | |
| is_active | BooleanField | No | True | |
| created_at | DateTimeField | No | | auto_now_add |

## OutletSettings (core)
| Field Name | Type | Required? | Default | Notes |
|---|---|---|---|---|
| id | UUIDField | No | uuid4 | auto-generated |
| outlet | OneToOneField | Yes | | FK → Outlet |
| opening_time | TimeField | No | '09:00' | |
| closing_time | TimeField | No | '21:00' | |
| grace_period_minutes | IntegerField | No | 15 | |
| default_credit_days | IntegerField | No | 30 | |
| invoice_prefix | CharField | No | 'INV' | |
| gst_registered | BooleanField | No | True | |
| print_logo | BooleanField | No | True | |
| thermal_print | BooleanField | No | False | |
| printer_width | IntegerField | No | 80 | |
| low_stock_alert_days | IntegerField | No | 7 | |
| expiry_alert_days | IntegerField | No | 30 | |
| enable_whatsapp | BooleanField | No | False | |
| whatsapp_api_key | CharField | No | | |
| currency_symbol | CharField | No | '₹' | |
| updated_at | DateTimeField | No | | auto_now |

## MasterProduct (inventory)
| Field Name | Type | Required? | Default | Notes |
|---|---|---|---|---|
| id | UUIDField | No | uuid4 | auto-generated |
| name | CharField | Yes | | |
| composition | TextField | Yes | | |
| manufacturer | CharField | Yes | | |
| category | CharField | Yes | | |
| drug_type | CharField | Yes | | choices |
| schedule_type | CharField | No | 'OTC' | choices |
| hsn_code | CharField | Yes | | unique |
| gst_rate | DecimalField | No | 0 | |
| pack_size | IntegerField | Yes | | |
| pack_unit | CharField | Yes | | |
| pack_type | CharField | Yes | | choices |
| barcode | CharField | No | | unique |
| is_fridge | BooleanField | No | False | |
| is_discontinued | BooleanField | No | False | |
| image_url | URLField | No | | |
| mrp | DecimalField | No | 0 | |
| default_sale_rate | DecimalField | No | 0 | |
| min_qty | IntegerField | No | 10 | |
| reorder_qty | IntegerField | No | 50 | |
| created_at | DateTimeField | No | | auto_now_add |

## Batch (inventory)
| Field Name | Type | Required? | Default | Notes |
|---|---|---|---|---|
| id | UUIDField | No | uuid4 | auto-generated |
| outlet | ForeignKey | Yes | | FK → Outlet |
| product | ForeignKey | No | | FK → MasterProduct |
| batch_no | CharField | Yes | | |
| mfg_date | DateField | No | | |
| expiry_date | DateField | Yes | | |
| mrp | DecimalField | Yes | | |
| purchase_rate | DecimalField | Yes | | |
| sale_rate | DecimalField | Yes | | |
| qty_strips | IntegerField | No | 0 | |
| qty_loose | IntegerField | No | 0 | |
| rack_location | CharField | No | | |
| is_active | BooleanField | No | True | |
| is_opening_stock | BooleanField | No | False | |
| created_at | DateTimeField | No | | auto_now_add |

## Distributor (purchases)
| Field Name | Type | Required? | Default | Notes |
|---|---|---|---|---|
| id | UUIDField | No | uuid4 | auto-generated |
| outlet | ForeignKey | Yes | | FK → Outlet |
| name | CharField | Yes | | |
| gstin | CharField | No | | unique |
| drug_license_no | CharField | No | | |
| food_license_no | CharField | No | | |
| phone | CharField | Yes | | |
| email | EmailField | No | | |
| address | TextField | Yes | | |
| city | CharField | Yes | | |
| state | CharField | Yes | | |
| credit_days | IntegerField | No | 0 | |
| opening_balance | DecimalField | No | | |
| balance_type | CharField | No | 'CR' | choices |
| is_active | BooleanField | No | True | |
| created_at | DateTimeField | No | | auto_now_add |

## PurchaseInvoice (purchases)
| Field Name | Type | Required? | Default | Notes |
|---|---|---|---|---|
| id | UUIDField | No | uuid4 | auto-generated |
| outlet | ForeignKey | Yes | | FK → Outlet |
| distributor | ForeignKey | Yes | | FK → Distributor |
| invoice_no | CharField | Yes | | |
| invoice_date | DateField | Yes | | |
| due_date | DateField | No | | |
| purchase_type | CharField | No | 'credit' | choices |
| purchase_order_ref | CharField | No | | |
| godown | CharField | No | 'main' | choices |
| subtotal | DecimalField | Yes | | |
| discount_amount | DecimalField | No | 0 | |
| taxable_amount | DecimalField | Yes | | |
| gst_amount | DecimalField | No | 0 | |
| cess_amount | DecimalField | No | 0 | |
| freight | DecimalField | No | 0 | |
| round_off | DecimalField | No | 0 | |
| ledger_adjustment | DecimalField | No | 0 | |
| grand_total | DecimalField | Yes | | |
| amount_paid | DecimalField | No | 0 | |
| outstanding | DecimalField | No | 0 | |
| created_by | ForeignKey | No | | FK → Staff |
| notes | TextField | No | | |
| created_at | DateTimeField | No | | auto_now_add |

## PurchaseItem (purchases)
| Field Name | Type | Required? | Default | Notes |
|---|---|---|---|---|
| id | UUIDField | No | uuid4 | auto-generated |
| invoice | ForeignKey | Yes | | FK → PurchaseInvoice |
| batch | ForeignKey | Yes | | FK → Batch |
| master_product | ForeignKey | No | | FK → MasterProduct |
| custom_product_name | CharField | No | | |
| is_custom_product | BooleanField | No | False | |
| hsn_code | CharField | No | | |
| batch_no | CharField | Yes | | |
| expiry_date | DateField | Yes | | |
| pkg | IntegerField | Yes | | |
| qty | IntegerField | Yes | | |
| actual_qty | IntegerField | Yes | | |
| free_qty | IntegerField | No | 0 | |
| purchase_rate | DecimalField | Yes | | |
| discount_pct | DecimalField | No | 0 | |
| cash_discount_pct | DecimalField | No | 0 | |
| gst_rate | DecimalField | No | 0 | |
| cess | DecimalField | No | 0 | |
| mrp | DecimalField | Yes | | |
| ptr | DecimalField | Yes | | |
| pts | DecimalField | Yes | | |
| sale_rate | DecimalField | Yes | | |
| taxable_amount | DecimalField | Yes | | |
| gst_amount | DecimalField | Yes | | |
| cess_amount | DecimalField | No | 0 | |
| total_amount | DecimalField | Yes | | |
| created_at | DateTimeField | No | | auto_now_add |

## SaleInvoice (billing)
| Field Name | Type | Required? | Default | Notes |
|---|---|---|---|---|
| id | UUIDField | No | uuid4 | auto-generated |
| outlet | ForeignKey | Yes | | FK → Outlet |
| invoice_no | CharField | Yes | | |
| invoice_date | DateTimeField | Yes | | |
| customer | ForeignKey | No | | FK → Customer |
| doctor | ForeignKey | No | | FK → Doctor |
| subtotal | DecimalField | Yes | | |
| discount_amount | DecimalField | No | 0 | |
| extra_discount_pct | DecimalField | No | 0 | |
| taxable_amount | DecimalField | Yes | | |
| cgst_amount | DecimalField | No | 0 | |
| sgst_amount | DecimalField | No | 0 | |
| igst_amount | DecimalField | No | 0 | |
| cgst | DecimalField | No | 0 | |
| sgst | DecimalField | No | 0 | |
| igst | DecimalField | No | 0 | |
| round_off | DecimalField | No | 0 | |
| grand_total | DecimalField | Yes | | |
| payment_mode | CharField | Yes | | choices |
| cash_paid | DecimalField | No | 0 | |
| upi_paid | DecimalField | No | 0 | |
| card_paid | DecimalField | No | 0 | |
| credit_given | DecimalField | No | 0 | |
| amount_paid | DecimalField | Yes | | |
| amount_due | DecimalField | No | 0 | |
| is_return | BooleanField | No | False | |
| billed_by | ForeignKey | No | | FK → Staff |
| created_at | DateTimeField | No | | auto_now_add |

## SaleItem (billing)
| Field Name | Type | Required? | Default | Notes |
|---|---|---|---|---|
| id | UUIDField | No | uuid4 | auto-generated |
| invoice | ForeignKey | Yes | | FK → SaleInvoice |
| batch | ForeignKey | Yes | | FK → Batch |
| product_name | CharField | Yes | | |
| composition | CharField | No | | |
| pack_size | IntegerField | Yes | | |
| pack_unit | CharField | Yes | | |
| schedule_type | CharField | Yes | | |
| batch_no | CharField | Yes | | |
| expiry_date | DateField | Yes | | |
| mrp | DecimalField | Yes | | |
| sale_rate | DecimalField | Yes | | |
| rate | DecimalField | Yes | | |
| qty_strips | IntegerField | Yes | | |
| qty_loose | IntegerField | No | 0 | |
| qty_returned | PositiveIntegerField | No | 0 | |
| sale_mode | CharField | No | 'strip' | choices |
| discount_pct | DecimalField | No | 0 | |
| gst_rate | DecimalField | Yes | | |
| taxable_amount | DecimalField | Yes | | |
| gst_amount | DecimalField | Yes | | |
| total_amount | DecimalField | Yes | | |
| created_at | DateTimeField | No | | auto_now_add |

## ScheduleHRegister (billing)
| Field Name | Type | Required? | Default | Notes |
|---|---|---|---|---|
| id | UUIDField | No | uuid4 | auto-generated |
| sale_item | OneToOneField | Yes | | FK → SaleItem |
| patient_name | CharField | Yes | | |
| patient_age | IntegerField | Yes | | |
| patient_address | TextField | Yes | | |
| doctor_name | CharField | Yes | | |
| doctor_reg_no | CharField | Yes | | |
| prescription_no | CharField | Yes | | |
| created_at | DateTimeField | No | | auto_now_add |

## CreditAccount (billing)
| Field Name | Type | Required? | Default | Notes |
|---|---|---|---|---|
| id | UUIDField | No | uuid4 | auto-generated |
| outlet | ForeignKey | Yes | | FK → Outlet |
| customer | ForeignKey | Yes | | FK → Customer |
| credit_limit | DecimalField | No | 0 | |
| total_outstanding | DecimalField | No | 0 | |
| total_borrowed | DecimalField | No | 0 | |
| total_repaid | DecimalField | No | 0 | |
| status | CharField | No | 'active' | choices |
| last_transaction_date | DateTimeField | No | | |
| created_at | DateTimeField | No | | auto_now_add |

## CreditTransaction (billing)
| Field Name | Type | Required? | Default | Notes |
|---|---|---|---|---|
| id | UUIDField | No | uuid4 | auto-generated |
| credit_account | ForeignKey | Yes | | FK → CreditAccount |
| customer | ForeignKey | Yes | | FK → Customer |
| invoice | ForeignKey | No | | FK → SaleInvoice |
| type | CharField | Yes | | choices |
| amount | DecimalField | Yes | | |
| description | CharField | Yes | | |
| balance_after | DecimalField | Yes | | |
| recorded_by | ForeignKey | No | | FK → Staff |
| created_at | DateTimeField | No | | auto_now_add |
| date | DateField | No | | |

## PaymentEntry (billing)
| Field Name | Type | Required? | Default | Notes |
|---|---|---|---|---|
| id | UUIDField | No | uuid4 | auto-generated |
| outlet | ForeignKey | Yes | | FK → Outlet |
| distributor | ForeignKey | Yes | | FK → Distributor |
| date | DateField | Yes | | |
| total_amount | DecimalField | Yes | | |
| payment_mode | CharField | Yes | | choices |
| reference_no | CharField | No | | |
| notes | TextField | No | | |
| created_by | ForeignKey | No | | FK → Staff |
| created_at | DateTimeField | No | | auto_now_add |

## PaymentAllocation (billing)
| Field Name | Type | Required? | Default | Notes |
|---|---|---|---|---|
| id | UUIDField | No | uuid4 | auto-generated |
| payment | ForeignKey | Yes | | FK → PaymentEntry |
| invoice | ForeignKey | Yes | | FK → PurchaseInvoice |
| invoice_no | CharField | Yes | | |
| invoice_date | DateField | Yes | | |
| invoice_total | DecimalField | Yes | | |
| current_outstanding | DecimalField | Yes | | |
| allocated_amount | DecimalField | Yes | | |
| created_at | DateTimeField | No | | auto_now_add |

## LedgerEntry (billing)
| Field Name | Type | Required? | Default | Notes |
|---|---|---|---|---|
| id | UUIDField | No | uuid4 | auto-generated |
| outlet | ForeignKey | Yes | | FK → Outlet |
| entity_type | CharField | Yes | | choices |
| distributor | ForeignKey | No | | FK → Distributor |
| customer | ForeignKey | No | | FK → Customer |
| date | DateField | Yes | | |
| entry_type | CharField | Yes | | choices |
| reference_no | CharField | Yes | | |
| description | CharField | Yes | | |
| debit | DecimalField | No | 0 | |
| credit | DecimalField | No | 0 | |
| running_balance | DecimalField | Yes | | |
| created_at | DateTimeField | No | | auto_now_add |

## ReceiptEntry (billing)
| Field Name | Type | Required? | Default | Notes |
|---|---|---|---|---|
| id | UUIDField | No | uuid4 | auto-generated |
| outlet | ForeignKey | Yes | | FK → Outlet |
| customer | ForeignKey | Yes | | FK → Customer |
| date | DateField | Yes | | |
| total_amount | DecimalField | Yes | | |
| payment_mode | CharField | Yes | | choices |
| reference_no | CharField | No | | |
| notes | TextField | No | | |
| created_by | ForeignKey | No | | FK → Staff |
| created_at | DateTimeField | No | | auto_now_add |

## ReceiptAllocation (billing)
| Field Name | Type | Required? | Default | Notes |
|---|---|---|---|---|
| id | UUIDField | No | uuid4 | auto-generated |
| receipt | ForeignKey | Yes | | FK → ReceiptEntry |
| invoice | ForeignKey | Yes | | FK → SaleInvoice |
| allocated_amount | DecimalField | Yes | | |
| created_at | DateTimeField | No | | auto_now_add |

## ExpenseEntry (billing)
| Field Name | Type | Required? | Default | Notes |
|---|---|---|---|---|
| id | UUIDField | No | uuid4 | auto-generated |
| outlet | ForeignKey | Yes | | FK → Outlet |
| date | DateField | Yes | | |
| expense_head | CharField | Yes | | choices |
| custom_head | CharField | No | | |
| amount | DecimalField | Yes | | |
| payment_mode | CharField | Yes | | choices |
| reference_no | CharField | No | | |
| notes | TextField | No | | |
| created_by | ForeignKey | No | | FK → Staff |
| created_at | DateTimeField | No | | auto_now_add |

## SalesReturn (billing)
| Field Name | Type | Required? | Default | Notes |
|---|---|---|---|---|
| id | UUIDField | No | uuid4 | auto-generated |
| outlet | ForeignKey | Yes | | FK → Outlet |
| original_sale | ForeignKey | Yes | | FK → SaleInvoice |
| return_no | CharField | Yes | | |
| return_date | DateField | Yes | | |
| reason | TextField | Yes | | |
| total_amount | DecimalField | Yes | | |
| refund_mode | CharField | Yes | | choices |
| created_by | ForeignKey | No | | FK → Staff |
| created_at | DateTimeField | No | | auto_now_add |

## SalesReturnItem (billing)
| Field Name | Type | Required? | Default | Notes |
|---|---|---|---|---|
| id | UUIDField | No | uuid4 | auto-generated |
| sales_return | ForeignKey | Yes | | FK → SalesReturn |
| original_sale_item | ForeignKey | Yes | | FK → SaleItem |
| batch | ForeignKey | Yes | | FK → Batch |
| product_name | CharField | Yes | | |
| batch_no | CharField | Yes | | |
| qty_returned | IntegerField | Yes | | |
| return_rate | DecimalField | Yes | | |
| total_amount | DecimalField | Yes | | |

## NotificationLog (billing)
| Field Name | Type | Required? | Default | Notes |
|---|---|---|---|---|
| id | UUIDField | No | uuid4 | auto-generated |
| outlet | ForeignKey | Yes | | FK → Outlet |
| customer | ForeignKey | Yes | | FK → Customer |
| channel | CharField | No | 'whatsapp' | choices |
| message | TextField | Yes | | |
| status | CharField | No | 'pending' | choices |
| sent_at | DateTimeField | No | | |
| created_at | DateTimeField | No | | auto_now_add |

## Staff (accounts)
| Field Name | Type | Required? | Default | Notes |
|---|---|---|---|---|
| id | UUIDField | No | uuid4 | auto-generated |
| outlet | ForeignKey | Yes | | FK → Outlet |
| name | CharField | Yes | | |
| phone | CharField | Yes | | unique |
| email | EmailField | No | | |
| role | CharField | No | 'billing_staff' | choices |
| staff_pin | CharField | Yes | | |
| avatar_url | URLField | No | | |
| max_discount | DecimalField | No | 0 | |
| can_edit_rate | BooleanField | No | False | |
| can_view_purchase_rates | BooleanField | No | False | |
| can_create_purchases | BooleanField | No | False | |
| can_access_reports | BooleanField | No | False | |
| is_active | BooleanField | No | True | |
| is_staff | BooleanField | No | False | |
| joining_date | DateTimeField | No | | auto_now_add |
| last_login | DateTimeField | No | | |
| created_at | DateTimeField | No | | auto_now_add |

## Customer (accounts)
| Field Name | Type | Required? | Default | Notes |
|---|---|---|---|---|
| id | UUIDField | No | uuid4 | auto-generated |
| outlet | ForeignKey | Yes | | FK → Outlet |
| name | CharField | Yes | | |
| phone | CharField | Yes | | |
| address | TextField | No | | |
| dob | DateField | No | | |
| gstin | CharField | No | | |
| fixed_discount | DecimalField | No | 0 | |
| credit_limit | DecimalField | No | 0 | |
| outstanding | DecimalField | No | 0 | |
| total_purchases | DecimalField | No | 0 | |
| total_visits | IntegerField | No | 0 | |
| is_chronic | BooleanField | No | False | |
| is_active | BooleanField | No | True | |
| blood_group | CharField | No | | |
| allergies | JSONField | No | [] | |
| chronic_conditions | JSONField | No | [] | |
| preferred_doctor | ForeignKey | No | | FK → Doctor |
| last_refill_date | DateField | No | | |
| next_refill_due | DateField | No | | |
| notes | TextField | No | | |
| created_at | DateTimeField | No | | auto_now_add |

## Doctor (accounts)
| Field Name | Type | Required? | Default | Notes |
|---|---|---|---|---|
| id | UUIDField | No | uuid4 | auto-generated |
| outlet | ForeignKey | Yes | | FK → Outlet |
| name | CharField | Yes | | |
| phone | CharField | No | | |
| registration_no | CharField | No | | |
| degree | CharField | No | | |
| qualification | CharField | No | | |
| specialty | CharField | No | | |
| hospital_name | CharField | No | | |
| address | TextField | No | | |
| is_active | BooleanField | No | True | |
| created_at | DateTimeField | No | | auto_now_add |

## RegularMedicine (accounts)
| Field Name | Type | Required? | Default | Notes |
|---|---|---|---|---|
| id | UUIDField | No | uuid4 | auto-generated |
| customer | ForeignKey | Yes | | FK → Customer |
| outlet | ForeignKey | Yes | | FK → Outlet |
| product_id | CharField | Yes | | |
| name | CharField | Yes | | |
| qty | PositiveIntegerField | No | 1 | |
| frequency | CharField | No | 'Monthly' | choices |
| notes | TextField | No | | |
| created_at | DateTimeField | No | | auto_now_add |

## LedgerGroup (accounts)
| Field Name | Type | Required? | Default | Notes |
|---|---|---|---|---|
| id | UUIDField | No | uuid4 | auto-generated |
| outlet | ForeignKey | Yes | | FK → Outlet |
| name | CharField | Yes | | |
| parent | ForeignKey | No | | FK → LedgerGroup |
| nature | CharField | Yes | | choices |
| is_system | BooleanField | No | False | |
| created_at | DateTimeField | No | | auto_now_add |

## Ledger (accounts)
| Field Name | Type | Required? | Default | Notes |
|---|---|---|---|---|
| id | UUIDField | No | uuid4 | auto-generated |
| outlet | ForeignKey | Yes | | FK → Outlet |
| name | CharField | Yes | | |
| group | ForeignKey | Yes | | FK → LedgerGroup |
| opening_balance | DecimalField | No | 0 | |
| balance_type | CharField | No | 'Dr' | |
| current_balance | DecimalField | No | 0 | |
| phone | CharField | No | | |
| gstin | CharField | No | | |
| address | TextField | No | | |
| linked_customer | ForeignKey | No | | FK → Customer |
| linked_distributor | ForeignKey | No | | FK → Distributor |
| is_system | BooleanField | No | False | |
| created_at | DateTimeField | No | | auto_now_add |
| station | CharField | No | | |
| mail_to | CharField | No | | |
| contact_person | CharField | No | | |
| designation | CharField | No | | |
| phone_office | CharField | No | | |
| phone_residence | CharField | No | | |
| fax_no | CharField | No | | |
| website | CharField | No | | |
| email | EmailField | No | | |
| pincode | CharField | No | | |
| freeze_upto | DateField | No | | |
| dl_no | CharField | No | | |
| dl_expiry | DateField | No | | |
| vat_no | CharField | No | | |
| vat_expiry | DateField | No | | |
| st_no | CharField | No | | |
| st_expiry | DateField | No | | |
| food_licence_no | CharField | No | | |
| food_licence_expiry | DateField | No | | |
| extra_heading_no | CharField | No | | |
| extra_heading_expiry | DateField | No | | |
| pan_no | CharField | No | | |
| it_pan_no | CharField | No | | |
| gst_heading | CharField | No | 'local' | choices |
| bill_export | CharField | No | 'gstn' | choices |
| ledger_type | CharField | No | 'registered' | choices |
| balancing_method | CharField | No | 'bill_by_bill' | choices |
| ledger_category | CharField | No | 'OTHERS' | |
| state | CharField | No | | |
| country | CharField | No | 'India' | |
| color | CharField | No | 'normal' | choices |
| is_hidden | BooleanField | No | False | |
| retailio_id | CharField | No | | |

## Voucher (accounts)
| Field Name | Type | Required? | Default | Notes |
|---|---|---|---|---|
| id | UUIDField | No | uuid4 | auto-generated |
| outlet | ForeignKey | Yes | | FK → Outlet |
| voucher_type | CharField | Yes | | choices |
| voucher_no | CharField | Yes | | |
| date | DateField | Yes | | |
| narration | TextField | No | | |
| total_amount | DecimalField | Yes | | |
| payment_mode | CharField | No | 'cash' | choices |
| created_by | ForeignKey | Yes | | FK → Staff |
| created_at | DateTimeField | No | | auto_now_add |

## VoucherLine (accounts)
| Field Name | Type | Required? | Default | Notes |
|---|---|---|---|---|
| id | UUIDField | No | uuid4 | auto-generated |
| voucher | ForeignKey | Yes | | FK → Voucher |
| ledger | ForeignKey | Yes | | FK → Ledger |
| debit | DecimalField | No | 0 | |
| credit | DecimalField | No | 0 | |
| description | TextField | No | | |

## VoucherBillAdjustment (accounts)
| Field Name | Type | Required? | Default | Notes |
|---|---|---|---|---|
| id | UUIDField | No | uuid4 | auto-generated |
| voucher | ForeignKey | Yes | | FK → Voucher |
| invoice_type | CharField | Yes | | choices |
| sale_invoice | ForeignKey | No | | FK → SaleInvoice |
| purchase_invoice | ForeignKey | No | | FK → PurchaseInvoice |
| adjusted_amount | DecimalField | Yes | | |
| created_at | DateTimeField | No | | auto_now_add |

## DebitNote (accounts)
| Field Name | Type | Required? | Default | Notes |
|---|---|---|---|---|
| id | UUIDField | No | uuid4 | auto-generated |
| outlet | ForeignKey | Yes | | FK → Outlet |
| debit_note_no | CharField | Yes | | |
| date | DateField | Yes | | |
| distributor | ForeignKey | Yes | | FK → Distributor |
| purchase_invoice | ForeignKey | No | | FK → PurchaseInvoice |
| reason | TextField | Yes | | |
| subtotal | DecimalField | No | 0 | |
| gst_amount | DecimalField | No | 0 | |
| total_amount | DecimalField | Yes | | |
| status | CharField | No | 'pending' | choices |
| created_by | ForeignKey | Yes | | FK → Staff |
| created_at | DateTimeField | No | | auto_now_add |

## DebitNoteItem (accounts)
| Field Name | Type | Required? | Default | Notes |
|---|---|---|---|---|
| id | UUIDField | No | uuid4 | auto-generated |
| debit_note | ForeignKey | Yes | | FK → DebitNote |
| batch | ForeignKey | Yes | | FK → Batch |
| product_name | CharField | Yes | | |
| qty | DecimalField | Yes | | |
| rate | DecimalField | Yes | | |
| gst_rate | DecimalField | No | 0 | |
| total | DecimalField | Yes | | |

## CreditNote (accounts)
| Field Name | Type | Required? | Default | Notes |
|---|---|---|---|---|
| id | UUIDField | No | uuid4 | auto-generated |
| outlet | ForeignKey | Yes | | FK → Outlet |
| credit_note_no | CharField | Yes | | |
| date | DateField | Yes | | |
| customer | ForeignKey | No | | FK → Customer |
| sale_invoice | ForeignKey | No | | FK → SaleInvoice |
| reason | TextField | Yes | | |
| subtotal | DecimalField | No | 0 | |
| gst_amount | DecimalField | No | 0 | |
| total_amount | DecimalField | Yes | | |
| status | CharField | No | 'pending' | choices |
| created_by | ForeignKey | Yes | | FK → Staff |
| created_at | DateTimeField | No | | auto_now_add |

## CreditNoteItem (accounts)
| Field Name | Type | Required? | Default | Notes |
|---|---|---|---|---|
| id | UUIDField | No | uuid4 | auto-generated |
| credit_note | ForeignKey | Yes | | FK → CreditNote |
| batch | ForeignKey | Yes | | FK → Batch |
| product_name | CharField | Yes | | |
| qty | DecimalField | Yes | | |
| rate | DecimalField | Yes | | |
| gst_rate | DecimalField | No | 0 | |
| total | DecimalField | Yes | | |

## JournalEntry (accounts)
| Field Name | Type | Required? | Default | Notes |
|---|---|---|---|---|
| id | UUIDField | No | uuid4 | auto-generated |
| outlet | ForeignKey | Yes | | FK → Outlet |
| source_type | CharField | Yes | | choices |
| source_id | UUIDField | Yes | | |
| date | DateField | Yes | | |
| narration | TextField | No | | |
| created_at | DateTimeField | No | | auto_now_add |

## JournalLine (accounts)
| Field Name | Type | Required? | Default | Notes |
|---|---|---|---|---|
| id | UUIDField | No | uuid4 | auto-generated |
| journal_entry | ForeignKey | Yes | | FK → JournalEntry |
| ledger | ForeignKey | Yes | | FK → Ledger |
| debit_amount | DecimalField | No | 0 | |
| credit_amount | DecimalField | No | 0 | |
