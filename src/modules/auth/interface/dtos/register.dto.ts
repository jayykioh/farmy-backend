import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  Matches,
} from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Email không đúng định dạng!' })
  @IsNotEmpty({ message: 'Email không được để trống!' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'Mật khẩu phải chứa ít nhất 8 ký tự!' })
  @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message: 'Mật khẩu quá yếu! Phải gồm chữ hoa, chữ thường và chữ số.',
  })
  password: string;

  @IsString()
  @IsNotEmpty({ message: 'Họ tên không được để trống!' })
  name: string;
}
