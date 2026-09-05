import { Body, Controller, Delete, Get, Param, Patch, Post, UnauthorizedException } from '@nestjs/common';
import { Action } from '{{projectNameKebab}}-shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { CheckPolicies } from '../casl/policies.decorator';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectResponseDto } from './dto/project-response.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';

/**
 * The canonical worked example — see docs/adding-a-resource.md. Tenant-scoped (every query runs
 * through ProjectsService's TenantContext-backed client), RBAC-guarded (@CheckPolicies(), rules
 * defined once in packages/shared and reused isomorphically), DTO-validated in, DTO-shaped out.
 */
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @CheckPolicies((ability) => ability.can(Action.Read, 'Project'))
  async findAll(): Promise<ProjectResponseDto[]> {
    const projects = await this.projectsService.findAll();
    return projects.map((project) => new ProjectResponseDto(project));
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can(Action.Read, 'Project'))
  async findOne(@Param('id') id: string): Promise<ProjectResponseDto> {
    const project = await this.projectsService.findOne(id);
    return new ProjectResponseDto(project);
  }

  @Post()
  @CheckPolicies((ability) => ability.can(Action.Create, 'Project'))
  async create(
    @Body() dto: CreateProjectDto,
    @CurrentUser() user: { id: string } | null,
  ): Promise<ProjectResponseDto> {
    if (!user) {
      throw new UnauthorizedException();
    }
    const project = await this.projectsService.create(dto, user.id);
    return new ProjectResponseDto(project);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can(Action.Update, 'Project'))
  async update(@Param('id') id: string, @Body() dto: UpdateProjectDto): Promise<ProjectResponseDto> {
    const project = await this.projectsService.update(id, dto);
    return new ProjectResponseDto(project);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can(Action.Delete, 'Project'))
  async remove(@Param('id') id: string): Promise<{ id: string }> {
    await this.projectsService.remove(id);
    return { id };
  }
}
