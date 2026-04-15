from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('purchases', '0004_purchaseitem_freight_per_unit_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='purchaseinvoice',
            name='ledger_note',
            field=models.CharField(
                blank=True,
                help_text='Optional note explaining the ledger adjustment',
                max_length=255,
                null=True,
            ),
        ),
    ]
