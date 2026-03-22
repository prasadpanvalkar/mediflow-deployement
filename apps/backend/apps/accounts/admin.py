from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import Staff, Customer


@admin.register(Staff)
class StaffAdmin(UserAdmin):
    """Admin interface for Staff members."""
    list_display = ('name', 'phone', 'role', 'outlet', 'is_active', 'created_at')
    list_filter = ('role', 'is_active', 'outlet', 'created_at')
    search_fields = ('name', 'phone', 'email')
    ordering = ('-created_at',)
    
    fieldsets = (
        (None, {'fields': ('phone', 'password')}),
        ('Personal Info', {'fields': ('name', 'email', 'avatar_url')}),
        ('Organization', {'fields': ('outlet',)}),
        ('Role & Permissions', {
            'fields': (
                'role',
                'max_discount',
                'can_edit_rate',
                'can_view_purchase_rates',
                'can_create_purchases',
                'can_access_reports',
            )
        }),
        ('Access Control', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Important Dates', {'fields': ('joining_date', 'last_login', 'created_at')}),
    )
    
    readonly_fields = ('created_at', 'last_login', 'joining_date')
    
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('phone', 'password1', 'password2'),
        }),
        ('Personal Info', {'fields': ('name', 'email')}),
        ('Organization', {'fields': ('outlet',)}),
        ('Role', {'fields': ('role',)}),
    )


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    """Admin interface for Customers."""
    list_display = ('name', 'phone', 'outlet', 'outstanding', 'is_chronic', 'created_at')
    list_filter = ('is_chronic', 'is_active', 'outlet', 'created_at')
    search_fields = ('name', 'phone', 'address')
    ordering = ('-created_at',)
    
    fieldsets = (
        ('Personal Info', {'fields': ('name', 'phone', 'email', 'address')}),
        ('Organization', {'fields': ('outlet',)}),
        ('Credit Terms', {
            'fields': (
                'fixed_discount',
                'credit_limit',
                'outstanding',
                'total_purchases',
                'total_visits',
            )
        }),
        ('Medical Info', {
            'fields': (
                'is_chronic',
                'chronic_conditions',
                'blood_group',
                'allergies',
                'preferred_doctor',
                'last_refill_date',
                'next_refill_due',
                'notes',
            )
        }),
        ('B2B', {'fields': ('gstin',)}),
        ('Status', {'fields': ('is_active',)}),
        ('Metadata', {'fields': ('created_at',)}),
    )
    
    readonly_fields = ('created_at', 'total_purchases', 'total_visits')
