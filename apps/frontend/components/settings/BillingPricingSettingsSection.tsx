'use client';

import { IndianRupee } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import { SettingsToggleRow } from './SettingsToggleRow';
import { useOutletSettings } from '@/hooks/useOutletSettings';

export function BillingPricingSettingsSection() {
    const { toast } = useToast();
    const { settings, isLoading, updateSettings } = useOutletSettings();

    const includeGst = settings?.landingCostIncludeGst ?? false;
    const includeFreight = settings?.landingCostIncludeFreight ?? false;

    const handleUpdate = async (field: string, value: boolean) => {
        try {
            await updateSettings({ [field]: value });
            toast({ title: 'Settings saved successfully' });
        } catch (err) {
            toast({ title: 'Failed to save settings', variant: 'destructive' });
        }
    };

    if (isLoading && !settings) {
        return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading settings...</div>;
    }

    return (
        <div className="space-y-6">
            <SettingsSectionHeader
                icon={<IndianRupee />}
                title="Billing & Pricing"
                description="Configure business policies, landing costs, and profit margin calculation rules."
            />

            <div className="rounded-xl border bg-white p-4 space-y-2">
                <p className="text-sm font-semibold text-slate-800 mb-3">Landing Cost Floor Configurations</p>
                <div className={`transition-opacity ${isLoading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                    <SettingsToggleRow
                        label="Include GST in Landing Cost Floor"
                        description="Turn ON only if your pharmacy does NOT claim GST Input Tax Credit (ITC) — for example, if you are on the composition scheme or sell exempt items. For most GST-registered pharmacies, keep this OFF (GST is recovered as ITC credit and is not your cost)."
                        checked={includeGst}
                        disabled={isLoading}
                        onCheckedChange={(val) => handleUpdate('landing_cost_include_gst', val)}
                        warningMessage=""
                    />
                </div>
                
                <div className={`mt-4 transition-opacity ${isLoading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                    <SettingsToggleRow
                        label="Include Freight in Landing Cost Floor"
                        description="When ON, per-unit freight entered during purchase is added to the minimum sale price floor. Recommended ON for accurate cost tracking."
                        checked={includeFreight}
                        disabled={isLoading}
                        onCheckedChange={(val) => handleUpdate('landing_cost_include_freight', val)}
                    />
                </div>
            </div>
            
        </div>
    );
}
