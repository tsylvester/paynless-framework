'use client';

import React from 'react';
import { useOrganizationStore } from '@paynless/store';
import { OrganizationMemberWithProfile } from '@paynless/types';
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from '@/components/ui/button'; // Shadcn Button
import { useCurrentUser } from '../../hooks/useCurrentUser'; 

// Helper function to get initials
const getInitials = (firstName?: string | null, lastName?: string | null): string => {
  const firstInitial = firstName?.charAt(0) ?? '';
  const lastInitial = lastName?.charAt(0) ?? '';
  return `${firstInitial}${lastInitial}`.toUpperCase() || 'U'; // Default to 'U' if no names
};

// Helper function to construct full name
const getFullName = (firstName?: string | null, lastName?: string | null): string => {
  return [firstName, lastName].filter(Boolean).join(' ') || 'Unknown User';
};

export const MemberListCard: React.FC = () => {
  const {
    currentOrganizationMembers,
    isLoading,
    updateMemberRole, 
    removeMember,     
    currentOrganizationId, // Keep for potential use in actions
  } = useOrganizationStore();
  
  const { user: currentUser } = useCurrentUser();
  
  // Derive current user role locally
  const currentUserMembership = currentOrganizationMembers.find(m => m.user_id === currentUser?.id);
  const currentUserRoleInOrg = currentUserMembership?.role;

  // Placeholder actions
  const handleChangeRole = (membershipId: string, currentRole: 'admin' | 'member') => {
    const newRole = currentRole === 'admin' ? 'member' : 'admin';
    console.log(`TODO: Change role of ${membershipId} to ${newRole}`);
    // updateMemberRole(membershipId, newRole);
  };

  const handleRemoveMember = (membershipId: string) => {
    console.log(`TODO: Remove member ${membershipId}`);
    // removeMember(membershipId);
  };

  const handleLeaveOrganization = (membershipId: string) => {
    console.log(`TODO: Leave organization for membership ${membershipId}`);
    // removeMember(membershipId);
  };

  const isLoadingMembers = isLoading; 

  // Define columns for shadcn Table
  // Note: shadcn Table structure is different, often defined directly in JSX

  return (
    <Card>
      <CardHeader>
        <CardTitle>Members</CardTitle>
        {/* Add other header elements if needed */}
      </CardHeader>
      <CardContent>
        {isLoadingMembers && currentOrganizationMembers.length === 0 ? (
          <div className="flex justify-center items-center p-4">
            {/* Use shadcn Skeleton or a simple text/spinner */}
            Loading members...
          </div>
        ) : currentOrganizationMembers.length === 0 ? (
           <p className="text-muted-foreground p-4 text-center">No members found.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            {/* Use imported OrganizationMemberWithProfile type */}
            <TableBody>
              {currentOrganizationMembers.map((item: OrganizationMemberWithProfile) => {
                const profile = item.user_profiles; // Use the correct property name
                const fullName = getFullName(profile?.first_name, profile?.last_name);
                const initials = getInitials(profile?.first_name, profile?.last_name);
                // Determine email - use current user's email if it's them, else placeholder
                const displayEmail = currentUser?.id === item.user_id 
                                     ? currentUser?.email ?? 'No email' 
                                     : 'Email not available'; // Placeholder
                
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                         <Avatar className="h-8 w-8">
                            {/* No avatar_url available in type */}
                            <AvatarImage src={undefined} alt={fullName} /> 
                            <AvatarFallback>{initials}</AvatarFallback>
                         </Avatar>
                         <div>
                            <div>{fullName}</div>
                            <div className="text-xs text-muted-foreground">{displayEmail}</div>
                         </div>
                      </div>
                    </TableCell>
                    <TableCell>{item.role}</TableCell>
                    <TableCell className="text-right">
                      {currentUser?.id === item.user_id ? (
                       <Button 
                         size="sm" 
                         variant="outline" 
                         className='text-destructive border-destructive hover:bg-destructive/10'
                         onClick={() => handleLeaveOrganization(item.id)}
                        >
                          Leave
                        </Button>
                    ) : currentUserRoleInOrg === 'admin' ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem 
                            onClick={() => handleChangeRole(item.id, item.role as 'admin' | 'member')}
                           >
                             {item.role === 'admin' ? 'Make Member' : 'Make Admin'}
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="text-destructive focus:text-destructive focus:bg-destructive/10"
                            onClick={() => handleRemoveMember(item.id)}
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
        )}
      </CardContent>
    </Card>
  );
}; 