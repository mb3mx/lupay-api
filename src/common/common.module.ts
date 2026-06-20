import { Global, Module } from '@nestjs/common';
import { ClientScopeService } from './services/client-scope.service';

@Global()
@Module({
  providers: [ClientScopeService],
  exports: [ClientScopeService],
})
export class CommonModule {}
