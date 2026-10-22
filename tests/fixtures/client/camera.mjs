export class CameraRig {
  constructor(){this.yaw=0;this.pitch=0;this.camera={fov:75};}
  look(dx,dy,sens){this.yaw-=dx*sens;this.pitch-=dy*sens;}
}
