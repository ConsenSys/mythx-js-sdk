import * as request from 'request-promise';
import * as fs from 'fs';
import { execSync } from 'child_process';
// import * as ora from 'ora';
import * as semver from 'semver';
import LoadingStrategy from './LoadingStrategy';
import VersionRange from './VersionRange';


export default class Docker extends LoadingStrategy {
  public async load() {
    const versionString = await this.validateAndGetSolcVersion();
    const command =
      'docker run -i ethereum/solc:' + this.config.version + ' --standard-json';

    const versionRange = new VersionRange();
    const commit = versionRange.getCommitFromVersion(versionString);

    return versionRange
      .getSolcByCommit(commit)
      .then(solcjs => {
        return {
          compile: (options: any) => String(execSync(command, { input: options })),
          importsParser: solcjs,
          version: () => versionString,
        };
      })
      .catch(error => {
        if (error.message === 'No matching version found') {
          throw this.errors('noVersion', versionString);
        }
        throw new Error(error);
      });
  }

  public getDockerTags() {
    return request(this.config.dockerTagsUrl)
      .then((list: any) => JSON.parse(list).results.map(item => item.name))
      .catch((error: any) => {
        throw this.errors('noRequest', this.config.dockerTagsUrl, error);
      });
  }

  public downloadDockerImage(image: any) {
    if (!semver.valid(image)) {
      const message =
        `The image version you have provided is not valid.\n` +
        `Please ensure that ${image} is a valid docker image name.`;
      throw new Error(message);
    }
    // const spinner = ora({
    //   color: 'red',
    //   text: 'Downloading Docker image',
    // }).start();
    try {
      execSync(`docker pull ethereum/solc:${image}`);
      // spinner.stop();
    } catch (error) {
      // spinner.stop();
      throw new Error(error);
    }
  }

  public async validateAndGetSolcVersion() {
    const image = this.config.version;
    const fileName = image + '.version';

    // Skip validation if they've validated for this image before.
    if (this.fileIsCached(fileName)) {
      const cachePath = this.resolveCache(fileName);
      return fs.readFileSync(cachePath, 'utf-8');
    }
    // Image specified
    if (!image) {
      throw this.errors('noString', image);
    }

    // Docker exists locally
    try {
      execSync('docker -v');
    } catch (error) {
      throw this.errors('noDocker');
    }

    // Image exists locally
    try {
      execSync('docker inspect --type=image ethereum/solc:' + image);
    } catch (error) {
      console.log(`${image} does not exist locally.\n`);
      console.log('Attempting to download the Docker image.');
      this.downloadDockerImage(image);
    }

    // Get version & cache.
    const version = execSync(
      'docker run ethereum/solc:' + image + ' --version',
    );
    const normalized = new VersionRange().normalizeSolcVersion(version);
    this.addFileToCache(normalized, fileName);
    return normalized;
  }
}
