import {test} from 'node:test';import assert from 'node:assert/strict';import {reportedContainerState} from '../control/docker';
test('crashes require a known nonzero exit code and a desired running state',()=>{
 assert.equal(reportedContainerState({Status:'exited',ExitCode:1}), 'crashed');
 assert.equal(reportedContainerState({Status:'exited',ExitCode:143},false),'exited');
 assert.equal(reportedContainerState({Status:'exited',ExitCode:0}),'exited');
 assert.equal(reportedContainerState({Status:'exited'}),'exited');
 assert.equal(reportedContainerState({Status:'running',ExitCode:1}),'running');
});
