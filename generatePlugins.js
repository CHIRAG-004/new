import { readFile, writeFile } from "fs/promises";
import Fs from "fs";
import { unlink } from "fs";
import path from "path";
import fetch from "node-fetch";
import axios from "axios";
import AdmZip from "adm-zip";
let check = {};
let cache = null;
Fs.readFile("cache2.json", "utf8", async (err, data) => {
  if (err) {
    console.error("Error reading cached file:", err);
    return;
  }
  cache = JSON.parse(data);
  main();
});

export async function main() {
  let compatiblePluginArr = [];
  const { versionArr, fetchPlugins } = await getPluginsAndVersions();
  const latestMoodleVersion = versionArr.slice(2, 5);
  const latestSixMoodleVersion = versionArr.slice(0, 6);

  for (let k = 0; k < fetchPlugins.length; k++) {
    let plugin = fetchPlugins[k];
    const isPluginCompatible = await checkIfCompatibleWithLatestVersion(
      plugin,
      latestMoodleVersion
    );
    if (isPluginCompatible) {
      compatiblePluginArr.push(plugin);
    }
  }

  console.log(compatiblePluginArr.length);
  const pluginJsonData = await createPluginJson(
    latestSixMoodleVersion,
    compatiblePluginArr
  );
  await writeVersionFile(pluginJsonData);
  await writeErrorFile(check)
}

async function getPluginsAndVersions() {
  const __dirname = path.resolve();
  const versionJson = JSON.parse(
    await readFile(path.join(__dirname, "versions.json"))
  );
  const versionArr = versionJson.map((version) => version["name"]);
  const allPluginFile = await readFile(
    path.join(__dirname, "moodle-plugins.all.txt"),
    "utf-8"
  );
  const allPluginArr = allPluginFile.split("\n");
  const fetchPlugins = allPluginArr;
  return { versionArr, fetchPlugins };
}

async function checkIfCompatibleWithLatestVersion(pluginName, versionArr) {
  let cachePluginObj = null;
  for (let i = 0; i < versionArr.length; i++) {
    cachePluginObj = cache[`${pluginName}-${versionArr[i]}`];
    if (cachePluginObj) {
      if (
        !isVersionPresent(
          versionArr[i],
          cachePluginObj["pluginfo"]["version"]["supportedmoodles"]
        )
      ) {
        return false;
      }
    } else {
      check[pluginName] = versionArr[i];
      const data = await getDataFromAPI(
        `https://download.moodle.org/api/1.3/pluginfo.php?format=json&plugin=${pluginName}&minversion=0&branch=${versionArr[i]}`
      );

      if (data) {
        if (
          !isVersionPresent(
            versionArr[i],
            data["pluginfo"]["version"]["supportedmoodles"]
          )
        ) {
          return false;
        }
      } else return false;
    }
  }
  return true;
}

function isVersionPresent(currentver, supporetdVersion) {
  const supportedVersionArr = supporetdVersion.map((ver) => ver.release);
  if (supportedVersionArr.includes(currentver)) {
    return true;
  } else {
    return false;
  }
}

async function getDataFromAPI(api) {
  let data = null;
  try {
    const response = await fetch(api);
    const status = response.status;
    if (status >= 400) {
      console.log("status ", response.status);
      throw new Error(`Link ${api} returned status ${status}`);
    }
    data = await response.json();
    return data;
  } catch (error) {
    console.error(`Error checking link response code: ${error}`);
    return null;
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function writeVersionFile(fileData) {
  const fileName = "newScriptPlugin.json";
  const data = JSON.stringify(fileData, null, 4);
  await writeFile(fileName, data);
}

async function writeErrorFile(fileData) {
    const fileName = "pluginError.json";
    const data = JSON.stringify(fileData, null, 4);
    await writeFile(fileName, data);
  }
  

async function createPluginJson(versionArr, pluginArr) {
  let mainPluginJson = {};
  let otherSupportsArr = [];
  for (let i = 0; i < pluginArr.length; i++) {
    const plugin = pluginArr[i];

    for (let j = 0; j < versionArr.length; j++) {
      const version = versionArr[j];
      try {
        if (!otherSupportsArr.includes(version)) {
            console.log(plugin, version)
          const data = await fetchPluginInfo(plugin, version, mainPluginJson);
          if (data) {
            if (plugin in mainPluginJson === false) {
              mainPluginJson[plugin] = data;
              otherSupportsArr = [
                ...mainPluginJson[plugin]["moodle_versions"][version]
                  .other_support,
              ];
            } else {
              mainPluginJson[plugin]["moodle_versions"][version] = data;
              otherSupportsArr = [
                ...mainPluginJson[plugin]["moodle_versions"][version]
                  .other_support,
              ];
            }
          }
          console.log(mainPluginJson)
        }
      } catch (error) {
        check[plugin] = version
        console.error(
          `Error fetching data for ${version}: plugin: ${plugin} ${error}`
        );
      }
    }
    otherSupportsArr = [];
  }
  return mainPluginJson;
}

async function fetchPluginInfo(plugin, version, mainPluginJson) {
  const api = `https://download.moodle.org/api/1.3/pluginfo.php?format=json&plugin=${plugin}&minversion=0&branch=${version}`;
  let fetchedCacheObj = cache[`${plugin}-${version}`];
  let pluginObj = null;
  let supportedVersionArr = null;
  if (fetchedCacheObj) {
    supportedVersionArr = fetchedCacheObj["pluginfo"][
      "version"
    ].supportedmoodles.map((support) => {
      return support.release;
    });
    if (supportedVersionArr.includes(version)) {
      pluginObj = createPluginObject(
        fetchedCacheObj,
        version,
        mainPluginJson,
        plugin
      );
    }
  } else {
    try {
      await getDataFromAPI(api).then((data) => {
        console.log(
          "new data hereeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
        );
        if (data) {
          supportedVersionArr = data["pluginfo"][
            "version"
          ].supportedmoodles.map((support) => {
            return support.release;
          });
          if (supportedVersionArr.includes(version)) {
            pluginObj = createPluginObject(
              data,
              version,
              mainPluginJson,
              plugin
            );
          }
        }
      });
    } catch (error) {
      console.error(`Failed to fetch data for ${plugin}`, error);
      throw error;
    }
  }
  return pluginObj;
}

async function createPluginObject(plugin, version, mainPluginJson, pluginName) {
  let pluginObj = new Object();
  if (pluginName in mainPluginJson === false) {
    pluginObj = {
      name: plugin["pluginfo"].name,
      component_name: plugin["pluginfo"].component,
      vcsrepositoryurl: plugin["pluginfo"]["version"].vcsrepositoryurl,
      doc: plugin["pluginfo"]["doc"],
      bugs: plugin["pluginfo"]["bugs"],
      moodle_versions: {
        [version]: {
          plugin_version: plugin["pluginfo"]["version"].version,
          downloadurl: plugin["pluginfo"]["version"].downloadurl,
          release: plugin["pluginfo"]["version"].release,
          maturity: plugin["pluginfo"]["version"].maturity,
          vcstag: plugin["pluginfo"]["version"].vcstag,
          downloadmd5: plugin["pluginfo"]["version"].downloadmd5,
          vcsbranch: plugin["pluginfo"]["version"].vcsbranch
            ? plugin["pluginfo"]["version"].vcsbranch
            : "master",
        },
      },
    };
  } else {
    pluginObj = {
      plugin_version: plugin["pluginfo"]["version"].version,
      downloadurl: plugin["pluginfo"]["version"].downloadurl,
      release: plugin["pluginfo"]["version"].release,
      maturity: plugin["pluginfo"]["version"].maturity,
      vcstag: plugin["pluginfo"]["version"].vcstag,
      downloadmd5: plugin["pluginfo"]["version"].downloadmd5,
      vcsbranch: plugin["pluginfo"]["version"].vcsbranch
        ? plugin["pluginfo"]["version"].vcsbranch
        : "master",
    };
  }

  if (
    plugin["pluginfo"]["version"].supportedmoodles.length === 1 &&
    plugin["pluginfo"]["version"].supportedmoodles[0].release === version
  ) {
    if (pluginName in mainPluginJson === false) {
      pluginObj.moodle_versions[version].other_support = [null];
    } else {
      pluginObj.other_support = [null];
    }
  } else {
    if (pluginName in mainPluginJson === false) {
      pluginObj.moodle_versions[version].other_support = plugin["pluginfo"][
        "version"
      ].supportedmoodles
        .reverse()
        .slice(0, 6)
        .map((ver) => {
          if (ver.release !== version) {
            return ver.release;
          }
        });
    } else {
      pluginObj.other_support = plugin["pluginfo"]["version"].supportedmoodles
        .reverse()
        .slice(0, 6)
        .map((ver) => {
          if (ver.release !== version) {
            return ver.release;
          }
        });
    }
  }

  if (pluginName in mainPluginJson === false) {
    pluginObj["moodle_versions"][version]["dependencies"] =
      await getPluginDependancy(plugin, version);
  } else {
    pluginObj["dependencies"] = await getPluginDependancy(plugin, version);
  }

  return pluginObj;
}


async function getPluginDependancy(pluginObj) {
  const __dirname = path.resolve();
  const dependencyGithubUrl = pluginObj["pluginfo"]["version"]["downloadurl"];
  const filePath = path.resolve(__dirname, "Dependency.zip");
  let dependenciesObj = null;
  let pluginDependencyArr = [];
  
  const data = await downloadZip(dependencyGithubUrl);
  if (data) {
    await parseDependencyZipFile(dependencyGithubUrl).then((dependencies) => {
      if (dependencies) {
        dependencies.forEach((dependency) => {
          if (dependency) {
            dependenciesObj = new Object();
            dependenciesObj.name = dependency.split("=>")[0].trim();
            dependenciesObj.version = dependency.split("=>")[1].trim();
            pluginDependencyArr.push(dependenciesObj);
          }
        });
      }
    });
    deleteDependencyZip(filePath);
  }
  return pluginDependencyArr;
}

async function downloadZip(url) {
    console.log(url)

    const __dirname = path.resolve();
    const filePath = path.resolve(__dirname, 'Dependency.zip');
    await sleep(60000)
    const response = await axios({
        method: "GET",
        url: url,
        responseType: 'stream'
    })
    
    response.data.pipe(Fs.createWriteStream(filePath));
  
    return new Promise((resolve, reject) => {
        response.data.on('end', () => {
            setTimeout(() => {
                resolve(true);
            }, 1000);
        })
  
        response.data.on('error', err => {
          console.log("error occurs", err)
            reject(err)
        })
    })
  }

  async function parseDependencyZipFile() {
    const __dirname = path.resolve();
    const filePath = path.resolve(__dirname, "Dependency.zip");
    let dependenciesArray = null;
  
    try {
      // Initialize the AdmZip instance with the zip file path
      const zip = new AdmZip(filePath);
  
      // Get the entries (files and directories) in the zip file
      const zipEntries = zip.getEntries();
  
      const folderEntry = zipEntries.find((entry) => entry.isDirectory);
  
      if (folderEntry) {
        const folderPath = folderEntry.entryName;
  
        const fileEntries = zipEntries.filter(
          (entry) => entry.entryName.startsWith(folderPath) && !entry.isDirectory
        );
  
        // Iterate over each file entry within the first folder
        for (const fileEntry of fileEntries) {
          // Read the content of each file
          if (fileEntry.entryName.endsWith("version.php")) {
            const fileContent = zip.readAsText(fileEntry);
            const regex = /\$plugin->dependencies\s*=\s*array\([^)]*\);/;
            const match = fileContent.match(regex);
  
            if (match) {
              const dependenciesString = match[0].split("(")[1].split(")")[0];
              dependenciesArray = dependenciesString
                .split(",")
                .map((dependency) =>
                  dependency.trim().replace(/['"\r\n\s\[\]]/g, "")
                )
                .filter((dependency) => dependency !== "");
            }
          }
        }
      }
    } catch (error) {
      console.error("Error reading the zip file:", error);
    }
  
    return dependenciesArray;
  }

  function deleteDependencyZip(path) {
    unlink(path, (err) => {
      if (err) {
        console.error("Error deleting file:", err);
      }
    });
  }
  