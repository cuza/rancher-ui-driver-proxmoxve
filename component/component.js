/*!!!!!!!!!!!Do not change anything between here (the DRIVERNAME placeholder will be automatically replaced at buildtime)!!!!!!!!!!!*/
import NodeDriver from 'shared/mixins/node-driver';

// do not remove LAYOUT, it is replaced at build time with a base64 representation of the template of the hbs template
// we do this to avoid converting template to a js file that returns a string and the cors issues that would come along with that
const LAYOUT;
/*!!!!!!!!!!!DO NOT CHANGE END!!!!!!!!!!!*/

const NET_MODEL_CHOICES = [
  {
    'name':  'Intel e1000',
    'value': 'e1000'
  },
  {
    'name':  'virtio (Paravirtualized)',
    'value': 'virtio'
  },  
  {
    'name':  'Realtek RTL8139',
    'value': 'rtl8139'
  },
  {
    'name':  'VMware vmxnet3',
    'value': 'vmxnet3'
  },
];

/*!!!!!!!!!!!GLOBAL CONST START!!!!!!!!!!!*/
// EMBER API Access - if you need access to any of the Ember API's add them here in the same manner rather then import them via modules, since the dependencies exist in rancher we dont want to expor the modules in the amd def
const computed     = Ember.computed;
const get          = Ember.get;
const set          = Ember.set;
const alias        = Ember.computed.alias;
const service      = Ember.inject.service;

const setProperties = Ember.setProperties;

const defaultRadix = 10;
const defaultBase  = 1024;
/*!!!!!!!!!!!GLOBAL CONST END!!!!!!!!!!!*/



/*!!!!!!!!!!!DO NOT CHANGE START!!!!!!!!!!!*/
export default Ember.Component.extend(NodeDriver, {
  driverName:     '%%DRIVERNAME%%',
  config:          alias('model.%%DRIVERNAME%%Config'),
  app:             service(),
  cookies:         service(),
  settings:        service(),
  step:            1,
  authToken:       null,
  netModelChoices: NET_MODEL_CHOICES,
  bridges:         [], 
  isoImages:       [],

  init() {
    // This does on the fly template compiling, if you mess with this :cry:
    const decodedLayout = window.atob(LAYOUT);
    const template      = Ember.HTMLBars.compile(decodedLayout, {
      moduleName: 'nodes/components/driver-%%DRIVERNAME%%/template'
    });
    set(this,'layout', template);

    this._super(...arguments);

  },
  /*!!!!!!!!!!!DO NOT CHANGE END!!!!!!!!!!!*/

  // Write your component here, starting with setting 'model' to a machine with your config populated
  bootstrap: function() {
    // bootstrap is called by rancher ui on 'init', you're better off doing your setup here rather then the init function to ensure everything is setup correctly
    console.log('resourceFields: ', get(this, 'resourceFields'));
    console.log('schema        : ', get(this, 'schema'));

    let config = get(this, 'globalStore').createRecord({
      type:                   '%%DRIVERNAME%%Config',
      user:                   '',
      realm:                  '',
      password:               '',
      host:                   '',
      node:                   '',
      port:                   '',
      cpuSockets:             this.fieldDef('cpuSockets').default,
      cpuCores:               this.fieldDef('cpuCores').default,
      memoryGb:               this.fieldDef('memoryGb').default,
      netModel:               this.fieldDef('netModel').default,
      netBridge:              this.fieldDef('netBridge').default,
      netVlantag:             '',
      pool:                   '',
      guestUername:           '',
      guestPassword:          '',
      guestSshPrivateKey:     '',
      guestSshPublicKey:      '',
      guestSshAuthorizedKeys: '',
      imageFile:              '',
    });

    set(this, 'model.%%DRIVERNAME%%Config', config);
    console.log('schema        : ', get(this, 'schema'));
  },
  resourceFields: computed('driverName', 'schema', function() {
    if (get(this, 'schema')) {
      return get(this, 'schema').get('resourceFields');
    }
  }),
  fieldNames: computed('driverName', 'schema', function() {
    if (get(this, 'schema')) {
      return Object.keys(get(this, 'schema').get('resourceFields'));
    }
  }),
  schema: computed('driverName', function() {
    const configName = `${ get(this, 'driverName') }Config`;
    return get(this, 'globalStore').getById('schema', configName.toLowerCase());
  }),
  fieldDef: function(fieldName) {
    let fields = get(this, 'resourceFields');
    return fields[fieldName];
  },
  // Add custom validation beyond what can be done from the config API schema
  validate() {
    // Get generic API validation errors
    this._super();
    var errors = get(this, 'errors')||[];
    if ( !get(this, 'model.name') ) {
      errors.push('Name is required');
    }

    // Add more specific errors

    // Check something and add an error entry if it fails:
    /*
    if ( parseInt(get(this, 'config.memorySize'), defaultRadix) < defaultBase ) {
      errors.push('Memory Size must be at least 1024 MB');
    }
    */

    // Set the array of errors for display,
    // and return true if saving should continue.
    if ( get(errors, 'length') ) {
      set(this, 'errors', errors);
      return false;
    } else {
      set(this, 'errors', null);
      return true;
    }
  },

  actions: {
    proxmoxLogin() {
      let self = this;
      set(self, 'errors', null);
      console.log('Proxmox VE Login.');
      self.apiRequest('POST', '/access/ticket').then((response) => {

        if(response.status !== 200) {
          console.log('response status !== 200 [authentication]: ', response.status );
          return;
        }

        response.json().then((json) => {
          console.log('response.json [authentication]: ', json);
          setProperties(self, {
            authToken: json.data,
            step: 2
          });
          self.setNetBridges();
          self.setIsoStorages();
        });


      }).catch((err) => {
        console.log('Authentication error: ', err);
      });
      console.log('end of proxmoxLogin');
      console.log('schema        : ', get(this, 'schema'));
    },
  },
  setIsoStorage(storage) {
    let self = this;
    self.apiRequest('GET', `/nodes/${self.config.node}/storage/${storage}/content`).then((response) => {
      if(response.status !== 200) {
        console.log('response status !== 200 [storage-contents]: ', response.status );
        return;
      }
      response.json().then((json) => {
        let storage = json.data.filter(store => store.format === 'iso' && store.content === 'iso');
        let isoStorage = get(self, 'isoImages');
        isoStorage.push(...storage);
        console.log('isoStorage: ', isoStorage);
        setProperties(self, {
          isoImages: isoStorage,
        });
      });
    }).catch((err) => {
      console.log('Error getting Networks: ', err);
    });
    console.log('end of setIsoStorage');
    console.log('schema        : ', get(this, 'schema'));
  },
  setIsoStorages() {
    let self = this;
    self.apiRequest('GET', `/nodes/${self.config.node}/storage`).then((response) => {
      if(response.status !== 200) {
        console.log('response status !== 200 [storage]: ', response.status );
        return;
      }
      response.json().then((json) => {
        let storage = json.data.filter(store => store.type === 'dir' && store.content.includes('iso'));
        storage.forEach( (store) =>  {
          self.setIsoStorage(store.storage);
        });

      });
    }).catch((err) => {
      console.log('Error getting Networks: ', err);
    });
    console.log('end of setIsoStorages');
    console.log('schema        : ', get(this, 'schema'));
  },
  setNetBridges: function() {
    let self = this;
    self.apiRequest('GET', `/nodes/${self.config.node}/network`).then((response) => {
      if(response.status !== 200) {
        console.log('response status !== 200 [networks]: ', response.status );
        return;
      }
      response.json().then((json) => {
        let netBridges = json.data.filter(device => device.type === 'bridge');
        console.log('netBridges: ', netBridges);
        setProperties(self, {
          bridges: netBridges,
        });
      });
    }).catch((err) => {
      console.log('Error getting Networks: ', err);
    });
    console.log('end of setNetBridges');
    console.log('schema        : ', get(this, 'schema'));
  },
  apiRequest: function(method, path) {
    let self       = this;
    let version    = `${ get(this, 'settings.rancherVersion') }`;
    let apiUrl     = `${self.config.host}:${self.config.port}/api2/json${path}`;
    let url        = `${ get(this, 'app.proxyEndpoint') }/`;
    url           += apiUrl.replace(/^http[s]?:\/\//, '');
    let headers    = new Headers();
    let options    = {
      method: method,
    };

    console.log(`Rancher version: ${version} api call with authToken: ${self.authToken} for command: ${path}`);
    if(self.authToken === null) {
      options['body'] = `username=${self.config.user}@${self.config.realm}&password=${self.config.password}`;
      headers.append('Content-Type', 'application/x-www-form-urlencoded;charset=utf-8');
      get(this, 'cookies').remove("PVEAuthCookie");
    } else {

      if ( 'v2.1.6' === version) {
        /**
         * Use this code until next release. 
         * next release service will remove the hability to use cookies service to send
         * custom cookies and will add some headers so proxy service pass the apropriate cookie
         */
        get(this, 'cookies').setWithOptions("PVEAuthCookie", self.authToken.ticket, {
          secure: 'auto'
        });
      } else {
        // Something like this should be done on next release of Rancher.
        headers.append("X-API-Cookie-Header", `PVEAuthCookie=${self.authToken.ticket};`);
      }
      headers.append("CSRFPreventionToken", self.authToken.CSRFPreventionToken);
      headers.append("username", self.authToken.username);
    }

    options['headers'] = headers;
    console.log('fetch options: ', options);
    return fetch(url, options).catch((err) => { console.log('fetch error: ', err); });
  },
  // Any computed properties or custom logic can go here
});
