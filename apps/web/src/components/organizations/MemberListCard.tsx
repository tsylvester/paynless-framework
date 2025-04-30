'use client';

import React from 'react';
import { useOrganizationStore } from '@paynless/store';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'; // Shadcn Card
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  TableHead, // Added import
} from '@/components/ui/table'; // Shadcn Table
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from '@/components/ui/button'; // Shadcn Button
import { useCurrentUser } from '../../hooks/useCurrentUser'; 
import { MoreHorizontal, RefreshCw } from "lucide-react";
import { logger } from '@paynless/utils'; // Keep logger for potential error logging
import { AdminBadge } from './AdminBadge'; // Import the badge

export const MemberListCard: React.FC = () => {
  const {
    currentOrganizationMembers,
    isLoading: isOrgLoading,
    selectCurrentUserRoleInOrg,
    updateMemberRole, // <<< Get action from store
    removeMember,     // <<< Get action from store
    fetchCurrentOrganizationMembers, // Get fetch function
    // TODO: Add removeMember and updateMemberRole actions from store
  } = useOrganizationStore();
  
  const { user: currentUser, isLoading: isUserLoading } = useCurrentUser();
  const isLoading = isOrgLoading || isUserLoading;
  const currentUserRole = selectCurrentUserRoleInOrg();
  const currentUserId = currentUser?.id;

  const handleRefresh = () => {
    logger.info('[MemberListCard] Refreshing members...');
    fetchCurrentOrganizationMembers();
  };

  // Placeholder handlers - Replace with actual store calls
  const handleRoleChange = (membershipId: string, newRole: 'admin' | 'member') => {
    logger.debug(`[MemberListCard] Attempting role change for ${membershipId} to ${newRole}`);
    updateMemberRole(membershipId, newRole); // <<< Use store action
    // TODO: Add error handling/feedback based on API response
  };

  const handleRemove = (membershipId: string) => {
    logger.debug(`[MemberListCard] Attempting removal for ${membershipId}`);
    // TODO: Add confirmation dialog
    removeMember(membershipId); // <<< Use store action
    // TODO: Add error handling/feedback
  };

  const handleLeave = (membershipId: string) => {
    // console.error(`[DEBUG] handleLeave called for ${membershipId}`); // <<< REMOVE DEBUG LOG
    logger.debug(`[MemberListCard] Attempting leave for ${membershipId}`);
    // TODO: Add confirmation dialog
    removeMember(membershipId); // <<< Use store action (assuming leave = remove self)
    // TODO: Add error handling/feedback
  };

  if (isLoading && (!currentOrganizationMembers || currentOrganizationMembers.length === 0)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>Loading members...</p>
        </CardContent>
      </Card>
    );
  }

  if (!currentOrganizationMembers || currentOrganizationMembers.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Members</CardTitle>
           <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isLoading}>
             <RefreshCw className="h-4 w-4" />
           </Button>
        </CardHeader>
        <CardContent>
          <p>No members found.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Members</CardTitle>
         <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isLoading}>
           <RefreshCw className="h-4 w-4" />
         </Button>
      </CardHeader>
      <CardContent>
        <Table className="relative w-full overflow-x-auto" data-slot="table-container">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentOrganizationMembers.map((member) => {
              const profile = member.user_profiles;
              const isCurrentUser = member.user_id === currentUserId;
              const isAdmin = currentUserRole === 'admin';
              const canAdministerMember = isAdmin && !isCurrentUser; // Admin can manage others
              const initials = profile?.first_name && profile?.last_name
                                ? `${profile.first_name.charAt(0)}${profile.last_name.charAt(0)}`
                                : 'U';
              const fullName = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : 'Unknown User';
              const displayEmail = 'Email not available';

              return (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8" data-slot="avatar">
                        <AvatarFallback data-slot="avatar-fallback">{initials.toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div>{fullName}</div>
                        <div className="text-xs text-muted-foreground">{displayEmail}</div> 
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {member.role === 'admin' ? <AdminBadge /> : member.role}
                  </TableCell>
                  <TableCell className="text-right">
                    {isCurrentUser ? (
                      <Button 
                        variant="destructive"
                        size="sm"
                        onClick={() => handleLeave(member.id)}
                        disabled={isLoading} // Disable during any loading
                      >
                        Leave
                      </Button>
                    ) : canAdministerMember ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {member.role === 'member' ? (
                            <DropdownMenuItem onClick={() => handleRoleChange(member.id, 'admin')}>
                              Make Admin
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => handleRoleChange(member.id, 'member')}>
                              Make Member
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem 
                            className="text-destructive focus:text-destructive focus:bg-destructive/10"
                            onClick={() => handleRemove(member.id)}
                          >
                            Remove Member
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <span>-</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}; 