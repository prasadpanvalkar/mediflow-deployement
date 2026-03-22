'use client';

import { useState } from 'react';
import { Plus, UserCog, Trophy, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PermissionGate } from '@/components/shared/PermissionGate';
import { StaffTable } from 'components/staff/StaffTable';
import { StaffFormModal } from 'components/staff/StaffFormModal';
import { StaffLeaderboard } from 'components/staff/StaffLeaderboard';

export default function StaffPage() {
    const [showForm, setShowForm] = useState(false);
    const [editingStaff, setEditingStaff] = useState<any>(null);

    const handleEdit = (staff: any) => {
        setEditingStaff(staff);
        setShowForm(true);
    };

    const handleClose = () => {
        setShowForm(false);
        setEditingStaff(null);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <UserCog className="w-6 h-6 text-blue-600" />
                        Staff Management
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Manage staff, PINs, roles, and performance tracking
                    </p>
                </div>
                <PermissionGate permission="manage_staff">
                    <Button onClick={() => setShowForm(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add Staff Member
                    </Button>
                </PermissionGate>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="staff">
                <TabsList>
                    <TabsTrigger value="staff" className="flex gap-2">
                        <UserCog className="w-4 h-4" />
                        Staff List
                    </TabsTrigger>
                    <TabsTrigger value="leaderboard" className="flex gap-2">
                        <Trophy className="w-4 h-4" />
                        Leaderboard
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="staff" className="mt-4">
                    <StaffTable onEdit={handleEdit} />
                </TabsContent>

                <TabsContent value="leaderboard" className="mt-4">
                    <StaffLeaderboard />
                </TabsContent>
            </Tabs>

            {/* Create/Edit Modal */}
            <StaffFormModal
                open={showForm}
                onClose={handleClose}
                editingStaff={editingStaff}
            />
        </div>
    );
}
