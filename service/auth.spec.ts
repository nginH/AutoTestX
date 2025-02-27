
          import { AuthService, AdminUser } from '../../src/service/auth';
          import { Auth } from 'firebase-admin/auth';
          import { EmailService } from '../../src/utils/mailer';
          import { RecentService } from '../../src/service/recent';

          describe('AuthService', () => {
            let firestoreClient: any;
            let authClient: any;
            let authService: AuthService;
            let emailService: any;
            let recentService: any;

            beforeEach(() => {
              firestoreClient = {
                collection: jest.fn().mockReturnValue({
                  doc: jest.fn().mockReturnValue({
                    set: jest.fn(),
                    delete: jest.fn()
                  }),
                  get: jest.fn().mockResolvedValue({
                    forEach: jest.fn()
                  })
                })
              };
              authClient = {
                createUser: jest.fn(),
                deleteUser: jest.fn(),
                generatePasswordResetLink: jest.fn(),
                getUserByEmail: jest.fn(),
                setCustomUserClaims: jest.fn(),
              };
              emailService = {
                sendEmails: jest.fn(),
              }
              recentService = {
                addRecentActivity: jest.fn()
              }

              authService = new AuthService(firestoreClient, authClient);
              authService["emailService"] = emailService;
              authService["recentService"] = recentService;
            });

            describe('createUser', () => {
              it('SERV-01: should create a user successfully', async () => {
                const user: AdminUser = {
                  email: 'test@example.com',
                  firstName: 'John',
                  lastName: 'Doe',
                  role: 'super',
                };
                (authClient.createUser as jest.Mock).mockResolvedValue({ uid: 'test-uid' });
                (authClient.generatePasswordResetLink as jest.Mock).mockResolvedValue('reset-link');

                const result = await authService.createUser(user);

                expect(authClient.createUser).toHaveBeenCalledWith({
                  email: user.email,
                  emailVerified: false,
                  password: expect.any(String),
                  displayName: `${user.firstName} ${user.lastName}`,
                  disabled: false,
                });
                expect(authClient.setCustomUserClaims).toHaveBeenCalledWith('test-uid', {
                  role: user.role,
                  department: user.department,
                });
                expect(firestoreClient.collection).toHaveBeenCalledWith('users');
                expect(firestoreClient.collection('users').doc('test-uid').set).toHaveBeenCalledWith({
                  email: user.email,
                  displayName: `${user.firstName} ${user.lastName}`,
                  role: user.role,
                  department: user.department,
                  uid: 'test-uid',
                  createdAt: expect.any(Date),
                });
                expect(emailService.sendEmails).toHaveBeenCalled();
                expect(recentService.addRecentActivity).toHaveBeenCalledWith("User creation", {name: `${user.firstName} ${user.lastName}`})
                expect(result.message).toContain('User created successfully');
                expect(result.responseStatus).toBe(200);
                expect(result.status).toBe('success');
                expect(result.result).toBeDefined();
              });

              it('SERV-02: should handle errors during user creation', async () => {
                const user: AdminUser = {
                  email: 'test@example.com',
                  firstName: 'John',
                  lastName: 'Doe',
                  role: 'super',
                };
                (authClient.createUser as jest.Mock).mockRejectedValue(new Error('Failed to create user'));

                await expect(authService.createUser(user)).rejects.toThrow('Error creating user: Failed to create user');
              });
            });

            describe('deleteUser', () => {
              it('SERV-03: should delete a user successfully', async () => {
                const uid = 'test-uid';

                await authService.deleteUser(uid);

                expect(authClient.deleteUser).toHaveBeenCalledWith(uid);
                expect(firestoreClient.collection('users').doc(uid).delete).toHaveBeenCalled();
              });

              it('SERV-04: should handle errors during user deletion', async () => {
                const uid = 'test-uid';
                (authClient.deleteUser as jest.Mock).mockRejectedValue(new Error('Failed to delete user'));

                await expect(authService.deleteUser(uid)).rejects.toThrow('Error deleting user: Failed to delete user');
              });
            });

             describe('resetPassword', () => {
                it('SERV-05: Should reset password successfully', async () => {
                  const email = 'test@example.com';
                  (authClient.getUserByEmail as jest.Mock).mockResolvedValue({
                    customClaims: { role: 'super', department: 'test' },
                    displayName: 'John Doe',
                  });
                  (authClient.generatePasswordResetLink as jest.Mock).mockResolvedValue('reset-link');
                  (emailService.sendEmails as jest.Mock).mockResolvedValue(undefined);

                  const result = await authService.resetPassword(email);

                  expect(authClient.getUserByEmail).toHaveBeenCalledWith(email);
                  expect(authClient.generatePasswordResetLink).toHaveBeenCalledWith(email);
                  expect(emailService.sendEmails).toHaveBeenCalled();
                  expect(result.message).toContain('Password reset link sent to email');
                  expect(result.responseStatus).toBe(200);
                  expect(result.status).toBe('success');
                  expect(result.result).toBeNull();
                });

                it('SERV-06: Should handle user not found error during password reset', async () => {
                  const email = 'test@example.com';
                  (authClient.getUserByEmail as jest.Mock).mockRejectedValue({ code: 'auth/user-not-found' });

                  const result = await authService.resetPassword(email);

                  expect(authClient.getUserByEmail).toHaveBeenCalledWith(email);
                  expect(result.message).toContain('User not found');
                  expect(result.responseStatus).toBe(400);
                  expect(result.status).toBe('error');
                  expect(result.result).toBeNull();
                });

                it('SERV-07: Should handle other errors during password reset', async () => {
                  const email = 'test@example.com';
                  (authClient.getUserByEmail as jest.Mock).mockRejectedValue(new Error('Failed to reset password'));

                  await expect(authService.resetPassword(email)).rejects.toThrow('Error updating password: Failed to reset password');
                });
              });

              describe('getAllUsers', () => {
                it('SERV-08: Should get all users successfully', async () => {
                  const mockUsers = [{ email: 'test@example.com', firstName: 'John', lastName: 'Doe', role: 'super' }];
                  (firestoreClient.collection('users').get as jest.Mock).mockResolvedValue({
                    forEach: (callback: (user: any) => void) => {
                      mockUsers.forEach(user => {
                        callback({ data: () => user });
                      });
                    },
                  });

                  const result = await authService.getAllUsers();

                  expect(firestoreClient.collection).toHaveBeenCalledWith('users');
                  expect(firestoreClient.collection('users').get).toHaveBeenCalled();
                  expect(result.message).toBe('Users fetched successfully');
                  expect(result.responseStatus).toBe(200);
                  expect(result.status).toBe('success');
                  expect(result.result).toEqual({ users: mockUsers, total: mockUsers.length });
                });

                it('SERV-09: Should handle errors when getting all users', async () => {
                  (firestoreClient.collection('users').get as jest.Mock).mockRejectedValue(new Error('Failed to get users'));

                  await expect(authService.getAllUsers()).rejects.toThrow('Error fetching users: Failed to get users');
                });
              });
          });
        