'use client';

import { useState } from 'react';
import {
    Table, TableBody, TableCell,
    TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
    DropdownMenu, DropdownMenuContent,
    DropdownMenuItem, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel,
    AlertDialogContent, AlertDialogDescription,
    AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';
import {
    MoreVertical, Pencil, Trash2,
    BarChart3, Search, Shield, Phone
} from 'lucide-react';
import { useStaffList, useDeleteStaff } from '@/hooks/useStaff';
import { StaffPerformanceModal } from 'components/staff/StaffPerformanceModal';
import { PermissionGate } from '@/components/shared/PermissionGate';

const ROLE_COLORS: Record<string, string> = {
    super_admin: 'bg-red-100 text-red-700',
    admin: 'bg-purple-100 text-purple-700',
    manager: 'bg-blue-100 text-blue-700',
    billing_staff: 'bg-green-100 text-green-700',
    view_only: 'bg-slate-100 text-slate-600',
};

const ROLE_LABELS: Record<string, string> = {
    super_admin: 'Super Admin',
    admin: 'Admin',
    manager: 'Manager',
    billing_staff: 'Billing Staff',
    view_only: 'View Only',
};

interface StaffTableProps {
    onEdit: (staff: any) => void;
}

export function StaffTable({ onEdit }: StaffTableProps) {
    const { data, isLoading } = useStaffList();
    const deleteMutation = useDeleteStaff();
    const [search, setSearch] = useState('');
    const [deleteTarget, setDeleteTarget] = useState<any>(null);
    const [perfTarget, setPerfTarget] = useState<any>(null);

    const staff = Array.isArray(data) ? data : [];

    const filtered = staff.filter((s: any) =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.phone?.includes(search) ||
        s.role.toLowerCase().includes(search.toLowerCase())
    );

    const handleDelete = () => {
        if (!deleteTarget) return;
        deleteMutation.mutate(deleteTarget.id, {
            onSuccess: () => setDeleteTarget(null),
        });
    };

    if (isLoading) {
        return (
            <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                    Loading staff...
                </CardContent>
            </Card>
        );
    }

    return (
        <>
            {/* Search */}
            <div className="relative mb-4 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                    placeholder="Search by name, phone, role..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                />
            </div>

            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead>Phone</TableHead>
                                <TableHead>Permissions</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filtered.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                                        No staff found
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filtered.map((s: any) => (
                                    <TableRow key={s.id}>
                                        {/* Name */}
                                        <TableCell>
                                            <div className="font-medium text-slate-900">{s.name}</div>
                                            <div className="text-xs text-muted-foreground">{s.email}</div>
                                        </TableCell>

                                        {/* Role */}
                                        <TableCell>
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${ROLE_COLORS[s.role]}`}>
                                                {ROLE_LABELS[s.role] ?? s.role}
                                            </span>
                                        </TableCell>

                                        {/* Phone */}
                                        <TableCell>
                                            <div className="flex items-center gap-1 text-sm text-slate-600">
                                                <Phone className="w-3 h-3" />
                                                {s.phone || '—'}
                                            </div>
                                        </TableCell>

                                        {/* Permissions */}
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1">
                                                {s.canEditRate && (
                                                    <span className="text-xs bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded">
                                                        Edit Rate
                                                    </span>
                                                )}
                                                {s.canCreatePurchases && (
                                                    <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                                                        Purchases
                                                    </span>
                                                )}
                                                {s.canAccessReports && (
                                                    <span className="text-xs bg-green-50 text-green-600 px-1.5 py-0.5 rounded">
                                                        Reports
                                                    </span>
                                                )}
                                                {s.canViewPurchaseRates && (
                                                    <span className="text-xs bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded">
                                                        Rates
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>

                                        {/* Status */}
                                        <TableCell>
                                            <Badge variant={s.isActive ? 'default' : 'secondary'}>
                                                {s.isActive ? 'Active' : 'Inactive'}
                                            </Badge>
                                        </TableCell>

                                        {/* Actions */}
                                        <TableCell className="text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon">
                                                        <MoreVertical className="w-4 h-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem
                                                        onClick={() => setPerfTarget(s)}
                                                    >
                                                        <BarChart3 className="w-4 h-4 mr-2" />
                                                        View Performance
                                                    </DropdownMenuItem>
                                                    <PermissionGate permission="manage_staff">
                                                        <DropdownMenuItem onClick={() => onEdit(s)}>
                                                            <Pencil className="w-4 h-4 mr-2" />
                                                            Edit
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            className="text-red-600"
                                                            onClick={() => setDeleteTarget(s)}
                                                        >
                                                            <Trash2 className="w-4 h-4 mr-2" />
                                                            Deactivate
                                                        </DropdownMenuItem>
                                                    </PermissionGate>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Delete Confirmation */}
            <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Deactivate {deleteTarget?.name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will mark the staff member as inactive. Their billing history
                            will be preserved. You can reactivate them later.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-red-600 hover:bg-red-700"
                            onClick={handleDelete}
                        >
                            Deactivate
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Performance Modal */}
            {perfTarget && (
                <StaffPerformanceModal
                    staff={perfTarget}
                    open={!!perfTarget}
                    onClose={() => setPerfTarget(null)}
                />
            )}
        </>
    );
}
