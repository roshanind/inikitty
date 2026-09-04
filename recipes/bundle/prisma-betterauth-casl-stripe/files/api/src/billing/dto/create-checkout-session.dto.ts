import { IsNotEmpty, IsString } from 'class-validator';

export class CreateCheckoutSessionDto {
  @IsString()
  @IsNotEmpty()
  priceId!: string;
}
