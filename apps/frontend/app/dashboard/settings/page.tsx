'use client';

import { useState, useCallback } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { SettingsSidebar, type SectionId } from '@/components/settings/SettingsSidebar';
import { OutletSettingsSection } from '@/components/settings/OutletSettingsSection';
import { GSTSettingsSection } from '@/components/settings/GSTSettingsSection';
import { PrinterSettingsSection } from '@/components/settings/PrinterSettingsSection';
import { BillingSettingsSection } from '@/components/settings/BillingSettingsSection';
import { BillingPricingSettingsSection } from '@/components/settings/BillingPricingSettingsSection';
import { AttendanceSettingsSection } from '@/components/settings/AttendanceSettingsSection';
import { NotificationsSection } from '@/components/settings/NotificationsSection';
import { PreferencesSection } from '@/components/settings/PreferencesSection';
import { DataManagementSection } from '@/components/settings/DataManagementSection';
import { Button } from '@/components/ui/button';

const SECTION_IDS: SectionId[] = [
    'outlet', 'gst', 'printer', 'billing', 'attendance',
    'notifications', 'preferences', 'data',
];

export default function SettingsPage() {
    const { hasPermission } = usePermissions();
    const canManageSettings = hasPermission('manage_settings');

    const [activeSection, setActiveSection] = useState<SectionId>(
        canManageSettings ? 'outlet' : 'preferences'
    );
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [discardKey, setDiscardKey] = useState(0);

    const handleDirty = useCallback(() => setHasUnsavedChanges(true), []);
    const handleSaved = useCallback(() => setHasUnsavedChanges(false), []);

    function handleDiscard() {
        setDiscardKey((k) => k + 1);
        setHasUnsavedChanges(false);
    }

    // Keyboard shortcuts: 1-8 to switch sections, s to hint-save
    useKeyboardShortcuts({
        '1': () => canManageSettings && setActiveSection('outlet'),
        '2': () => canManageSettings && setActiveSection('gst'),
        '3': () => canManageSettings && setActiveSection('printer'),
        '4': () => canManageSettings && setActiveSection('billing'),
        '5': () => canManageSettings && setActiveSection('attendance'),
        '6': () => canManageSettings && setActiveSection('notifications'),
        '7': () => setActiveSection('preferences'),
        '8': () => canManageSettings && setActiveSection('data'),
    });

    const sectionProps = {
        onDirty: handleDirty,
        onSaved: handleSaved,
        discardKey,
    };

    // billing_staff / view_only: only preferences
    if (!canManageSettings) {
        return (
            <div className="max-w-2xl mx-auto">
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
                    <p className="text-muted-foreground text-sm mt-1">App preferences</p>
                </div>
                <PreferencesSection {...sectionProps} />
            </div>
        );
    }

    return (
        <div className="relative">
            {/* Keyboard hint */}
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Pharmacy profile, printer setup, and preferences
                    </p>
                </div>
                <p className="hidden lg:block text-xs text-slate-400 font-mono bg-slate-100 px-3 py-1.5 rounded-lg">
                    1–8 Navigate · S Save
                </p>
            </div>

            {/* Two-column layout */}
            <div className="flex gap-0 min-h-[calc(100vh-10rem)] rounded-xl border bg-white overflow-hidden">
                {/* Left sidebar */}
                <SettingsSidebar
                    active={activeSection}
                    onChange={(id) => {
                        setActiveSection(id);
                    }}
                    hasUnsavedChanges={hasUnsavedChanges}
                />

                {/* Right content panel */}
                <div className="flex-1 p-8 overflow-y-auto max-w-3xl pb-24">
                    {activeSection === 'outlet' && (
                        <OutletSettingsSection {...sectionProps} />
                    )}
                    {activeSection === 'gst' && (
                        <GSTSettingsSection {...sectionProps} />
                    )}
                    {activeSection === 'printer' && (
                        <PrinterSettingsSection {...sectionProps} />
                    )}
                    {activeSection === 'billing' && (
                        <BillingSettingsSection {...sectionProps} />
                    )}
                    {activeSection === 'pricing' && (
                        <BillingPricingSettingsSection />
                    )}
                    {activeSection === 'attendance' && (
                        <AttendanceSettingsSection {...sectionProps} />
                    )}
                    {activeSection === 'notifications' && (
                        <NotificationsSection {...sectionProps} />
                    )}
                    {activeSection === 'preferences' && (
                        <PreferencesSection {...sectionProps} />
                    )}
                    {activeSection === 'data' && (
                        <DataManagementSection />
                    )}
                </div>
            </div>

            {/* Unsaved changes banner */}
            {hasUnsavedChanges && (
                <div className="fixed bottom-0 left-0 right-0 z-50 bg-amber-50 border-t border-amber-200 px-8 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-amber-500 text-sm">●</span>
                        <p className="text-sm font-medium text-amber-800">
                            You have unsaved changes
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={handleDiscard}>
                            Discard
                        </Button>
                        <Button
                            size="sm"
                            onClick={() => {
                                // Click the active section's submit button
                                const submitBtn = document.querySelector<HTMLButtonElement>(
                                    'form button[type="submit"]'
                                );
                                if (submitBtn) {
                                    submitBtn.click();
                                } else {
                                    setHasUnsavedChanges(false);
                                }
                            }}
                        >
                            Save Changes
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
