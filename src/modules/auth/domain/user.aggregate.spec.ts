import { User } from './user.aggregate';
import { Email } from './value-objects/email.value-object';

describe('User Aggregate', () => {
  it('should construct and return correct properties', () => {
    const userId = 'user-uuid-123456';
    const email = Email.create('user@example.com');
    const passwordHash = 'hashedpasswordhash';
    const name = 'Nguyen Van A';
    const role = 'user';

    const user = new User(userId, email, passwordHash, name, role);

    expect(user.getId()).toBe(userId);
    expect(user.getEmail()).toBe('user@example.com');
    expect(user.getPasswordHash()).toBe(passwordHash);
    expect(user.getName()).toBe(name);
    expect(user.getRole()).toBe(role);
  });

  it('should update the password hash', () => {
    const userId = 'user-uuid-123456';
    const email = Email.create('user@example.com');
    const passwordHash = 'hashedpasswordhash';
    const name = 'Nguyen Van A';
    const role = 'user';

    const user = new User(userId, email, passwordHash, name, role);

    user.updatePassword('newhashedpassword');
    expect(user.getPasswordHash()).toBe('newhashedpassword');
  });
});
