from django.core.management.base import BaseCommand
from apps.core.models import Outlet
from apps.accounts.services import LedgerService


class Command(BaseCommand):
    help = 'Seed default ledger groups and ledgers for all outlets'

    def handle(self, *args, **options):
        outlets = Outlet.objects.filter(is_active=True)
        if not outlets.exists():
            self.stdout.write(self.style.WARNING('No active outlets found.'))
            return

        for outlet in outlets:
            self.stdout.write(f'Seeding ledgers for outlet: {outlet.name}...')
            LedgerService.seed_default_ledgers(outlet)
            LedgerService.sync_customer_ledgers(outlet)
            LedgerService.sync_distributor_ledgers(outlet)

        from apps.accounts.models import LedgerGroup, Ledger
        self.stdout.write(self.style.SUCCESS(
            f'Done. Groups: {LedgerGroup.objects.count()}, Ledgers: {Ledger.objects.count()}'
        ))
