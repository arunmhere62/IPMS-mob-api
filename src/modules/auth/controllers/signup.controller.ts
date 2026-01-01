import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthDbService } from '../auth-db.service';
import { SignupDto } from '../dto/signup.dto';

@ApiTags('auth')
@Controller('auth')
export class SignupController {
  constructor(private readonly authService: AuthDbService) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register new user with organization and PG location' })
  @ApiResponse({
    status: 201,
    description: 'Account created successfully',
    schema: {
      example: {
        success: true,
        message: 'Account created successfully. Please wait for admin approval.',
        data: {
          userId: 1,
          pgId: 1,
          organizationId: 1,
          email: 'john@example.com',
          name: 'John Doe',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Email or phone already registered' })
  @ApiResponse({ status: 500, description: 'Failed to create account' })
  async signup(@Body() signupDto: SignupDto) {
    console.log('📝 Signup request received:', {
      organizationName: signupDto.organizationName,
      name: signupDto.name,
      email: signupDto.email,
      phone: signupDto.phone,
      pgName: signupDto.pgName,
      rentCycleType: signupDto.rentCycleType,
      rentCycleStart: signupDto.rentCycleStart,
      rentCycleEnd: signupDto.rentCycleEnd,
    });
    return this.authService.signup(signupDto);
  }
}
