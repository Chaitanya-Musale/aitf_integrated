'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { authService, userService, roleService } from '@/lib/auth';
import { Plus, Edit, Trash2, Users, Shield, UserCheck, UserX, Search } from 'lucide-react';
import UserProfile from '@/components/UserProfile';
import MobileUserMenu from '@/components/admin/MobileUserMenu';
import MobileRoleMenu from '@/components/admin/MobileRoleMenu';
import SessionTimeoutWarning from '@/components/SessionTimeoutWarning';

export default function AdminPage() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);
  const [userSearchQuery, setUserSearchQuery] = useState('');

  // Form states
  const [showUserForm, setShowUserForm] = useState(false);
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [userForm, setUserForm] = useState({ name: '', email: '', roleIds: [] });
  const [roleForm, setRoleForm] = useState({ name: '', description: '' });
  const [editUserForm, setEditUserForm] = useState({ id: null, name: '', roleIds: [] });

  const router = useRouter();
  const currentUser = authService.getUser();

  useEffect(() => {
    if (!authService.isAuthenticated() || !authService.hasRole('Admin')) {
      router.push('/login');
      return;
    }

    loadData();
  }, [router]);

  // Notification system - only one at a time, auto-fade in 5s
  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });

    // Auto-remove after 5 seconds
    setTimeout(() => {
      setNotification(null);
    }, 5000);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [usersData, rolesData] = await Promise.all([
        userService.getUsers(),
        roleService.getRoles()
      ]);
      setUsers(usersData.users);
      setRoles(rolesData.roles);
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };



  const handleCreateUser = async (e) => {
    e.preventDefault();

    // Validate that at least one role is selected
    if (userForm.roleIds.length === 0) {
      showNotification('Please assign at least one role to the user', 'error');
      return;
    }

    setLoading(true);
    try {
      await userService.createUser(userForm);
      showNotification('User created successfully and email sent!');
      setUserForm({ name: '', email: '', roleIds: [] });
      setShowUserForm(false);
      await loadData();
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRole = async (e) => {
    e.preventDefault();
    try {
      await roleService.createRole(roleForm);
      showNotification('Role created successfully!');
      setRoleForm({ name: '', description: '' });
      setShowRoleForm(false);
      await loadData();
    } catch (err) {
      showNotification(err.message, 'error');
    }
  };

  const handleEditUser = (user) => {
    setEditUserForm({
      id: user.id,
      name: user.name,
      roleIds: user.roles ? user.roles.map(role => role.id) : []
    });
    setShowEditUserModal(true);
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();

    // Validate that at least one role is selected
    if (editUserForm.roleIds.length === 0) {
      showNotification('User must have at least one role assigned', 'error');
      return;
    }

    try {
      await userService.updateUser(editUserForm.id, {
        name: editUserForm.name,
        roleIds: editUserForm.roleIds
      });
      showNotification('User updated successfully!');
      setShowEditUserModal(false);
      await loadData();
    } catch (err) {
      showNotification(err.message, 'error');
    }
  };

  const handleUserStatusChange = async (userId, status) => {
    try {
      await userService.updateUserStatus(userId, status);
      showNotification(`User ${status === 'active' ? 'activated' : 'deactivated'} successfully!`);
      await loadData();
    } catch (err) {
      showNotification(err.message, 'error');
    }
  };

  const handleDeleteUser = async (userId) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      try {
        await userService.deleteUser(userId);
        showNotification('User deleted successfully!');
        await loadData();
      } catch (err) {
        showNotification(err.message, 'error');
      }
    }
  };

  const handleDeleteRole = async (roleId) => {
    if (window.confirm('Are you sure you want to delete this role?')) {
      try {
        await roleService.deleteRole(roleId);
        showNotification('Role deleted successfully!');
        await loadData();
      } catch (err) {
        showNotification(err.message, 'error');
      }
    }
  };

  // Filter users based on search query
  const filteredUsers = users.filter(user => 
    user.name.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(userSearchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold">Loading...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <SessionTimeoutWarning />
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-2xl font-bold text-gray-900">AITF</h1>
            <div className="flex items-center space-x-4">
              {/* <span className="text-sm text-gray-600">Welcome, {currentUser?.name}</span> */}
              <UserProfile userName={currentUser?.name} />
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Notification */}
        {notification && (
          <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-right duration-300">
            <div className={`px-4 py-3 rounded-md shadow-lg border ${notification.type === 'error'
                ? 'bg-red-50 border-red-200 text-red-700'
                : 'bg-green-50 border-green-200 text-green-700'
              }`}>
              <div className="flex items-center justify-between">
                <span>{notification.message}</span>
                <button
                  onClick={() => setNotification(null)}
                  className={`ml-4 ${notification.type === 'error' ? 'text-red-500 hover:text-red-700' : 'text-green-500 hover:text-green-700'
                    }`}
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-[82vh]">
          {/* Users Management */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="flex items-center">
                    <Users className="w-5 h-5 mr-2" />
                    User Management
                  </CardTitle>
                  <CardDescription>Manage system users and their roles</CardDescription>
                </div>
                <Button onClick={() => setShowUserForm(!showUserForm)} size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Add User
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* User Form */}
              {showUserForm && (
                <form onSubmit={handleCreateUser} className="mb-6 p-4 bg-gray-50 rounded-lg">
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <Label htmlFor="userName">Name</Label>
                      <Input
                        id="userName"
                        value={userForm.name}
                        onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="userEmail">Email</Label>
                      <Input
                        id="userEmail"
                        type="email"
                        value={userForm.email}
                        onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <Label>Roles *</Label>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        {roles.map((role) => (
                          <label key={role.id} className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              checked={userForm.roleIds.includes(role.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setUserForm({ ...userForm, roleIds: [...userForm.roleIds, role.id] });
                                } else {
                                  setUserForm({ ...userForm, roleIds: userForm.roleIds.filter(id => id !== role.id) });
                                }
                              }}
                            />
                            <span className="text-sm">{role.name}</span>
                          </label>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">* At least one role must be selected</p>
                    </div>
                    <div className="flex space-x-2">
                      <Button type="submit" size="sm">Create User</Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => setShowUserForm(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                </form>
              )}

              {/* User Search */}
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    placeholder="Search users by name or email..."
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Users List */}
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {filteredUsers.length === 0 ? (
                  <div className="text-center py-6 text-gray-500">
                    <Users className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                    <p className="text-sm">
                      {userSearchQuery ? 'No users found matching your search' : 'No users found'}
                    </p>
                  </div>
                ) : (
                  filteredUsers.map((user) => (
                  <div key={user.id} className="flex items-center justify-between p-3 bg-white rounded-lg border hover:shadow-md transition-shadow">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <h4 className="font-medium">{user.name}</h4>
                        <span className={`px-2 py-1 text-xs rounded-full ${user.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                          {user.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">{user.email}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {user.roles?.map((role) => (
                          <span key={role.id} className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                            {role.name}
                          </span>
                        ))}
                      </div>
                    </div>
                    {user.id !== currentUser?.id && (
                      <>
                        {/* Desktop Buttons */}
                        <div className="hidden md:flex space-x-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditUser(user)}
                            className="transition-all duration-200 hover:scale-105"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleUserStatusChange(user.id, user.status === 'active' ? 'inactive' : 'active')}
                            className="transition-all duration-200 hover:scale-105"
                          >
                            {user.status === 'active' ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeleteUser(user.id)}
                            className="transition-all duration-200 hover:scale-105"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>

                        {/* Mobile Menu */}
                        <div className="md:hidden">
                          <MobileUserMenu
                            user={user}
                            currentUserId={currentUser?.id}
                            onEdit={handleEditUser}
                            onStatusChange={handleUserStatusChange}
                            onDelete={handleDeleteUser}
                          />
                        </div>
                      </>
                    )}
                  </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Roles Management */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="flex items-center">
                    <Shield className="w-5 h-5 mr-2" />
                    Role Management
                  </CardTitle>
                  <CardDescription>Manage system roles and permissions</CardDescription>
                </div>
                <Button onClick={() => setShowRoleForm(!showRoleForm)} size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Role
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Role Form */}
              {showRoleForm && (
                <form onSubmit={handleCreateRole} className="mb-6 p-4 bg-gray-50 rounded-lg">
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <Label htmlFor="roleName">Role Name</Label>
                      <Input
                        id="roleName"
                        value={roleForm.name}
                        onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="roleDescription">Description</Label>
                      <Input
                        id="roleDescription"
                        value={roleForm.description}
                        onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                      />
                    </div>
                    <div className="flex space-x-2">
                      <Button type="submit" size="sm">Create Role</Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => setShowRoleForm(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                </form>
              )}

              {/* Roles List */}
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {roles.map((role) => {
                  const baseRoles = ['Admin', 'HR', 'Interviewer'];
                  const isBaseRole = baseRoles.includes(role.name);
                  
                  return (
                    <div key={role.id} className="flex items-center justify-between p-3 bg-white rounded-lg border hover:shadow-md transition-shadow">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <h4 className="font-medium">{role.name}</h4>
                          {isBaseRole && (
                            <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                              Base Role
                            </span>
                          )}
                        </div>
                        {role.description && (
                          <p className="text-sm text-gray-600">{role.description}</p>
                        )}
                      </div>
                      {!isBaseRole && (
                        <>
                          {/* Desktop Button */}
                          <div className="hidden md:block">
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDeleteRole(role.id)}
                              className="transition-all duration-200 hover:scale-105"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>

                          {/* Mobile Menu */}
                          <div className="md:hidden">
                            <MobileRoleMenu
                              role={role}
                              isBaseRole={isBaseRole}
                              onDelete={handleDeleteRole}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Edit User Modal */}
        {showEditUserModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-in fade-in duration-300">
            <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4 transform transition-all duration-300 animate-in zoom-in-95">
              <h3 className="text-lg font-semibold mb-4">Edit User</h3>
              <form onSubmit={handleUpdateUser} className="space-y-4">
                <div>
                  <Label htmlFor="editUserName">Name</Label>
                  <Input
                    id="editUserName"
                    value={editUserForm.name}
                    onChange={(e) => setEditUserForm({ ...editUserForm, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>Email (Read-only)</Label>
                  <Input
                    value={users.find(u => u.id === editUserForm.id)?.email || ''}
                    disabled
                    className="bg-gray-100"
                  />
                </div>
                <div>
                  <Label>Roles *</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {roles.map((role) => (
                      <label key={role.id} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={editUserForm.roleIds.includes(role.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setEditUserForm({ ...editUserForm, roleIds: [...editUserForm.roleIds, role.id] });
                            } else {
                              setEditUserForm({ ...editUserForm, roleIds: editUserForm.roleIds.filter(id => id !== role.id) });
                            }
                          }}
                        />
                        <span className="text-sm">{role.name}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">* At least one role must be selected</p>
                </div>
                <div className="flex space-x-2 pt-4">
                  <Button type="submit" size="sm" className="transition-all duration-200 hover:scale-105">
                    Update User
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowEditUserModal(false)}
                    className="transition-all duration-200 hover:scale-105"
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}