import { IsInt, Min } from 'class-validator';

export class UpdateFeatureTourProgressDto {
  @IsInt()
  @Min(0)
  current_step: number;
}
